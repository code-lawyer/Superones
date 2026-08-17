import "server-only";

import {
  createDefaultOpcCatalog,
  defaultRangerIdentities,
  defaultServiceCategoryDescriptions,
  infrastructureGroups,
  OPC_CATEGORY_DESCRIPTION_MAX_LENGTH,
  RANGER_SIGNATURE_MAX_LENGTH,
  specialtyDomains,
  type OpcCatalogContent,
  type OpcService,
  type RangerIdentity,
  type RangerProfile,
  type ServiceCategoryDescription,
} from "./opc-catalog.ts";
import {
  opcCatalogSeedPath,
  readOpcCatalogSeedDocument,
  writeOpcCatalogSeedDocument,
} from "./opc-catalog-seed.ts";
import {
  mutateStateDocument,
  persistenceMode,
  readStateDocument,
  type StateDocumentDefinition,
} from "./state-document-store.ts";
import { isRangerAvatarAsset } from "./ranger-avatar.ts";
import { missingRangerAvatarObjectKeys } from "./ranger-avatar-image.ts";
import {
  deleteRangerMediaObject,
  deleteRangerMediaObjectsForSlug,
  listRangerMediaObjects,
} from "./ranger-avatar-storage.ts";

export const RANGER_AVATAR_ORPHAN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const RANGER_AVATAR_REPLACED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type ManagedServiceCatalog = {
  schemaVersion: 2;
  revision: number;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
  draft: OpcCatalogContent;
  published: OpcCatalogContent;
  publications: Array<{
    revision: number;
    publishedAt: string;
    catalog: OpcCatalogContent;
  }>;
};

export type CatalogValidationResult = {
  valid: boolean;
  errors: string[];
};

export class ServiceCatalogConflictError extends Error {
  constructor() {
    super("OPC 服务目录已被其他操作更新，请刷新后重试。");
    this.name = "ServiceCatalogConflictError";
  }
}

export class ServiceCatalogValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.slice(0, 5).join("；"));
    this.name = "ServiceCatalogValidationError";
    this.errors = errors;
  }
}

const placeholderValues = new Set([
  "待专业确认",
  "内容建模中",
  "PROFILE PREVIEW",
  "联系方式将在本人确认后公开",
  "待核验",
  "本人授权待确认",
]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const publicEmailPattern = /^[A-Za-z0-9!$&'*+/=_`{|}~-]+(?:\.[A-Za-z0-9!$&'*+/=_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const rangerAvatarPattern = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;
const legacyRangerIdentityNames = new Set(defaultRangerIdentities.map((identity) => identity.name));
const legacyRangerIdentityFallback = defaultRangerIdentities.find((identity) => identity.id === "startup-advisor")?.name
  ?? defaultRangerIdentities[0].name;

type CatalogNormalizationOptions = {
  migrateLegacyRangerIdentities?: boolean;
  migrateLegacyDescriptions?: boolean;
};

function initialState(): ManagedServiceCatalog {
  const seed = readOpcCatalogSeedDocument();
  const defaults = seed
    ? normalizeOpcCatalog(seed.catalog, {
      migrateLegacyRangerIdentities: seed.schemaVersion === 1,
      migrateLegacyDescriptions: !Array.isArray((seed.catalog as unknown as Record<string, unknown>).serviceCategoryDescriptions),
    })
    : createDefaultOpcCatalog();
  const validation = validateOpcCatalog(defaults, Boolean(seed?.publishedAt));
  if (!validation.valid) {
    throw new Error(`OPC 默认 seed 校验失败：${validation.errors.slice(0, 3).join("；")}`);
  }
  return {
    schemaVersion: 2,
    revision: seed?.sourceRevision ?? 1,
    draftUpdatedAt: null,
    publishedAt: seed?.publishedAt ?? null,
    draft: structuredClone(defaults),
    published: structuredClone(defaults),
    publications: seed?.publishedAt
      ? [{
        revision: seed.sourceRevision,
        publishedAt: seed.publishedAt,
        catalog: structuredClone(defaults),
      }]
      : [],
  };
}

function shouldSyncLocalSeedOnPublish() {
  if (process.env.NODE_ENV === "production" || persistenceMode() !== "file-preview") return false;
  const configured = process.env.VAULT2077_SYNC_LOCAL_SEED_ON_PUBLISH?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  if (configured) {
    throw new Error("VAULT2077_SYNC_LOCAL_SEED_ON_PUBLISH 只能设置为 true 或 false。");
  }
  return !process.env.VAULT2077_DATA_DIR;
}

async function writePublishedSeed(catalog: OpcCatalogContent, sourceRevision: number, publishedAt: string | null) {
  return writeOpcCatalogSeedDocument({
    schemaVersion: 2,
    sourceRevision,
    publishedAt,
    catalog: structuredClone(catalog),
  });
}

function cleanText(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\r\n/g, "\n").slice(0, max);
}

function cleanList(value: unknown, maxItems: number, maxItemLength: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(item, maxItemLength)).filter(Boolean))).slice(0, maxItems);
}

function normalizeService(value: unknown, kind: OpcService["kind"]): OpcService {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    kind,
    slug: cleanText(item.slug, 80).toLowerCase(),
    code: cleanText(item.code, 40).toUpperCase(),
    name: cleanText(item.name, 120),
    domain: kind === "infrastructure" ? "基础设施" : cleanText(item.domain, 60),
    group: cleanText(item.group, 60),
    outcome: cleanText(item.outcome, 500),
    audience: cleanText(item.audience, 500),
    includes: cleanList(item.includes, 20, 300),
    deliverables: cleanList(item.deliverables, 20, 300),
    materials: cleanList(item.materials, 20, 300),
    acceptance: cleanList(item.acceptance, 20, 300),
    boundary: cleanText(item.boundary, 500),
    price: cleanText(item.price, 100),
    feeNote: cleanText(item.feeNote, 300),
    period: cleanText(item.period, 100),
    revision: cleanText(item.revision, 40),
    status: cleanText(item.status, 40),
  };
}

function normalizeServiceCategoryDescription(value: unknown): ServiceCategoryDescription {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    section: cleanText(item.section, 20) as ServiceCategoryDescription["section"],
    name: cleanText(item.name, 60),
    description: cleanText(item.description, OPC_CATEGORY_DESCRIPTION_MAX_LENGTH),
  };
}

function legacyRangerDescription(id: string, name: string) {
  return defaultRangerIdentities.find((identity) => identity.id === id)?.description
    ?? `${name || "该领域"}相关的外部独立专业支持`;
}

function normalizeRangerIdentity(value: unknown, migrateLegacyDescriptions = false): RangerIdentity {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = cleanText(item.id, 80).toLowerCase();
  const name = cleanText(item.name, 60);
  return {
    id,
    name,
    description: cleanText(item.description, OPC_CATEGORY_DESCRIPTION_MAX_LENGTH)
      || (migrateLegacyDescriptions ? legacyRangerDescription(id, name) : ""),
  };
}

function normalizeRanger(value: unknown, identities: RangerIdentity[]): RangerProfile {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const avatar = isRangerAvatarAsset(item.avatar) ? structuredClone(item.avatar) : undefined;
  const legacyIdentity = cleanText(item.identity, 60);
  const identityId = cleanText(item.identityId, 80).toLowerCase()
    || identities.find((identity) => identity.name === legacyIdentity)?.id
    || "";
  return {
    slug: cleanText(item.slug, 80).toLowerCase(),
    publicName: cleanText(item.publicName, 120),
    identityId,
    signature: cleanText(item.signature, RANGER_SIGNATURE_MAX_LENGTH) || undefined,
    avatar,
    avatarUrl: cleanText(item.avatarUrl, 2_100_000) || undefined,
    intro: cleanText(item.intro, 500),
    tags: cleanList(item.tags, 12, 80),
    credential: cleanText(item.credential, 500) || undefined,
    contactLabel: cleanText(item.contactLabel, 300),
    contactState: cleanText(item.contactState, 60),
    verificationDate: cleanText(item.verificationDate, 40) || undefined,
    profileUpdatedAt: cleanText(item.profileUpdatedAt, 40) || undefined,
    authorizationStatus: cleanText(item.authorizationStatus, 80) || undefined,
  };
}

export function normalizeOpcCatalog(
  value: unknown,
  options: CatalogNormalizationOptions = {},
): OpcCatalogContent {
  const catalog = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rangerIdentities = options.migrateLegacyRangerIdentities
    ? structuredClone(defaultRangerIdentities)
    : Array.isArray(catalog.rangerIdentities)
      ? catalog.rangerIdentities.slice(0, 50).map((item) => normalizeRangerIdentity(item, options.migrateLegacyDescriptions))
      : [];
  return {
    infrastructure: Array.isArray(catalog.infrastructure)
      ? catalog.infrastructure.slice(0, 50).map((item) => normalizeService(item, "infrastructure"))
      : [],
    specialties: Array.isArray(catalog.specialties)
      ? catalog.specialties.slice(0, 200).map((item) => normalizeService(item, "specialty"))
      : [],
    serviceCategoryDescriptions: options.migrateLegacyDescriptions
      ? structuredClone(defaultServiceCategoryDescriptions)
      : Array.isArray(catalog.serviceCategoryDescriptions)
        ? catalog.serviceCategoryDescriptions.slice(0, 20).map(normalizeServiceCategoryDescription)
        : [],
    rangerIdentities,
    rangers: Array.isArray(catalog.rangers)
      ? catalog.rangers.slice(0, 200).map((item) => normalizeRanger(item, rangerIdentities))
      : [],
  };
}

function normalizeCatalogMutation(value: unknown) {
  const catalog = value && typeof value === "object" ? value as Record<string, unknown> : null;
  if (!catalog || !Array.isArray(catalog.rangerIdentities) || !Array.isArray(catalog.serviceCategoryDescriptions)) {
    throw new ServiceCatalogValidationError(["OPC 完整目录必须包含服务分类说明和顾问身份数组，不能使用默认内容静默补全。"]);
  }
  return normalizeOpcCatalog(catalog);
}

function required(errors: string[], label: string, value: string) {
  if (!value) errors.push(`${label}不能为空`);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateOpcCatalog(catalog: OpcCatalogContent, forPublication = false): CatalogValidationResult {
  const errors: string[] = [];
  const services = [...catalog.infrastructure, ...catalog.specialties];
  const slugs = new Set<string>();
  const codes = new Set<string>();
  const serviceCategoryKeys = new Set<string>();
  const rangerIdentityIds = new Set<string>();
  const rangerIdentityNames = new Set<string>();
  const expectedServiceCategoryKeys = new Set(defaultServiceCategoryDescriptions.map((category) => `${category.section}:${category.name}`));

  if (forPublication && catalog.infrastructure.length === 0) errors.push("基础设施至少需要一个已发布项目");
  if (forPublication && catalog.specialties.length === 0) errors.push("专项服务至少需要一个已发布项目");
  if (forPublication && catalog.rangerIdentities.length === 0) errors.push("至少需要一个可发布的顾问身份");

  for (const category of catalog.serviceCategoryDescriptions) {
    const key = `${category.section}:${category.name}`;
    const label = category.name || "未命名服务分类";
    if (!expectedServiceCategoryKeys.has(key)) errors.push(`${label}：不是受控的 OPC 服务分类`);
    if (serviceCategoryKeys.has(key)) errors.push(`${label}：分类说明重复`);
    serviceCategoryKeys.add(key);
    required(errors, `${label}：分类说明`, category.description);
  }
  for (const expected of defaultServiceCategoryDescriptions) {
    if (!serviceCategoryKeys.has(`${expected.section}:${expected.name}`)) {
      errors.push(`${expected.name}：缺少分类说明`);
    }
  }
  catalog.serviceCategoryDescriptions.forEach((category, index) => {
    const expected = defaultServiceCategoryDescriptions[index];
    if (expected && (category.section !== expected.section || category.name !== expected.name)) {
      errors.push(`${category.name || "未命名服务分类"}：分类顺序无效`);
    }
  });

  for (const identity of catalog.rangerIdentities) {
    const label = identity.name || identity.id || "未命名顾问身份";
    required(errors, `${label}：稳定 ID`, identity.id);
    required(errors, `${label}：公开名称`, identity.name);
    required(errors, `${label}：类别说明`, identity.description);
    if (identity.id && !slugPattern.test(identity.id)) errors.push(`${label}：稳定 ID 只能使用小写字母、数字和连字符`);
    if (rangerIdentityIds.has(identity.id)) errors.push(`${label}：稳定 ID 重复`);
    if (rangerIdentityNames.has(identity.name)) errors.push(`${label}：公开名称重复`);
    rangerIdentityIds.add(identity.id);
    rangerIdentityNames.add(identity.name);
  }

  for (const service of services) {
    const label = service.name || service.code || "未命名服务";
    required(errors, `${label}：slug`, service.slug);
    required(errors, `${label}：编号`, service.code);
    required(errors, `${label}：名称`, service.name);
    required(errors, `${label}：一句话结果`, service.outcome);
    required(errors, `${label}：适用对象`, service.audience);
    required(errors, `${label}：转交边界`, service.boundary);
    if (service.slug && !slugPattern.test(service.slug)) errors.push(`${label}：slug 只能使用小写字母、数字和连字符`);
    if (slugs.has(service.slug)) errors.push(`${label}：slug 必须在全部 OPC 服务中保持唯一`);
    slugs.add(service.slug);
    if (codes.has(service.code)) errors.push(`${label}：编号重复`);
    codes.add(service.code);
    if (service.kind === "infrastructure" && !infrastructureGroups.includes(service.group as never)) {
      errors.push(`${label}：基础设施分组无效`);
    }
    if (service.kind === "specialty" && !specialtyDomains.includes(service.domain as never)) {
      errors.push(`${label}：专项服务领域无效`);
    }
    if (!service.includes.length) errors.push(`${label}：至少填写一项包含内容`);
    if (!service.deliverables.length) errors.push(`${label}：至少填写一项交付成果`);
    if (!service.materials.length) errors.push(`${label}：至少填写一项所需材料`);
    if (!service.acceptance?.length) errors.push(`${label}：至少填写一项验收标准`);
    if (forPublication) {
      for (const [field, value] of [
        ["价格", service.price],
        ["费用说明", service.feeNote ?? ""],
        ["周期", service.period],
        ["修订", service.revision],
        ["状态", service.status],
      ] as const) {
        required(errors, `${label}：${field}`, value);
        if (placeholderValues.has(value)) errors.push(`${label}：${field}仍是预览占位值`);
      }
    }
  }

  const rangerSlugs = new Set<string>();
  for (const ranger of catalog.rangers) {
    const label = ranger.publicName || ranger.slug || "未命名游骑兵";
    required(errors, `${label}：slug`, ranger.slug);
    required(errors, `${label}：公开名称`, ranger.publicName);
    required(errors, `${label}：介绍`, ranger.intro);
    required(errors, `${label}：联系方式`, ranger.contactLabel);
    required(errors, `${label}：联系状态`, ranger.contactState);
    if (ranger.slug && !slugPattern.test(ranger.slug)) errors.push(`${label}：slug 只能使用小写字母、数字和连字符`);
    if (rangerSlugs.has(ranger.slug)) errors.push(`${label}：slug 重复`);
    rangerSlugs.add(ranger.slug);
    required(errors, `${label}：顾问身份`, ranger.identityId);
    if (ranger.identityId && !rangerIdentityIds.has(ranger.identityId)) {
      errors.push(`${label}：引用的顾问身份不存在`);
    }
    if (ranger.avatar && !isRangerAvatarAsset(ranger.avatar)) {
      errors.push(`${label}：托管头像元数据无效`);
    }
    if (
      ranger.avatar
      && (!ranger.avatar.smallKey.startsWith(`rangers/${ranger.slug}/`)
        || !ranger.avatar.largeKey.startsWith(`rangers/${ranger.slug}/`))
    ) {
      errors.push(`${label}：托管头像必须属于当前游骑兵 slug`);
    }
    if (ranger.avatarUrl && !rangerAvatarPattern.test(ranger.avatarUrl)) {
      errors.push(`${label}：旧版头像只允许 PNG、JPEG 或 WEBP Data URL；外部图片必须重新上传`);
    }
    if (!ranger.tags.length) errors.push(`${label}：至少填写一个专长标签`);
    if (forPublication && placeholderValues.has(ranger.contactLabel)) errors.push(`${label}：联系方式仍是预览占位值`);
    if (forPublication && placeholderValues.has(ranger.contactState)) errors.push(`${label}：联系状态仍是预览占位值`);
    if (forPublication) {
      if (!publicEmailPattern.test(ranger.contactLabel)) {
        errors.push(`${label}：联系方式必须是公开邮箱`);
      }
      if (ranger.contactState !== "EMAIL / PUBLIC") {
        errors.push(`${label}：联系状态必须是 EMAIL / PUBLIC`);
      }
      if (ranger.authorizationStatus !== "本人已授权公开") {
        errors.push(`${label}：授权状态必须是本人已授权公开`);
      }
      for (const [field, value] of [
        ["核验日期", ranger.verificationDate ?? ""],
        ["资料更新时间", ranger.profileUpdatedAt ?? ""],
        ["授权状态", ranger.authorizationStatus ?? ""],
      ] as const) {
        required(errors, `${label}：${field}`, value);
        if (placeholderValues.has(value)) errors.push(`${label}：${field}仍是预览占位值`);
      }
      if (ranger.verificationDate && !isIsoDate(ranger.verificationDate)) {
        errors.push(`${label}：核验日期必须使用 YYYY-MM-DD`);
      }
      if (ranger.profileUpdatedAt && !isIsoDate(ranger.profileUpdatedAt)) {
        errors.push(`${label}：资料更新时间必须使用 YYYY-MM-DD`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function legacyAvatarWriteErrors(next: OpcCatalogContent, previous: OpcCatalogContent) {
  const previousBySlug = new Map(previous.rangers.map((ranger) => [ranger.slug, ranger.avatarUrl]));
  return next.rangers.flatMap((ranger) => {
    if (!ranger.avatarUrl) return [];
    return previousBySlug.get(ranger.slug) === ranger.avatarUrl
      ? []
      : [`${ranger.publicName || ranger.slug || "未命名游骑兵"}：旧版 avatarUrl 只允许读取，必须重新上传到托管媒体存储`];
  });
}

function rangerAvatarKeys(catalog: OpcCatalogContent) {
  return catalog.rangers.flatMap((ranger) => ranger.avatar
    ? [ranger.avatar.smallKey, ranger.avatar.largeKey]
    : []);
}

function hasPublishableRangerContact(ranger: RangerProfile) {
  return publicEmailPattern.test(ranger.contactLabel)
    && ranger.contactState === "EMAIL / PUBLIC"
    && ranger.authorizationStatus === "本人已授权公开"
    && Boolean(ranger.verificationDate && isIsoDate(ranger.verificationDate))
    && Boolean(ranger.profileUpdatedAt && isIsoDate(ranger.profileUpdatedAt));
}

function isLegacyPreviewRanger(ranger: RangerProfile) {
  return ranger.slug.endsWith("-preview")
    || ranger.publicName.includes("公开档案示例");
}

function retainVerifiedPublicRangers(rangers: RangerProfile[]) {
  return rangers.filter((ranger) => !isLegacyPreviewRanger(ranger) && hasPublishableRangerContact(ranger));
}

function catalogNeedsDescriptionMigration(value: unknown) {
  const catalog = value && typeof value === "object" ? value as Record<string, unknown> : null;
  return !catalog || !Array.isArray(catalog.serviceCategoryDescriptions);
}

function parseState(value: unknown): ManagedServiceCatalog {
  if (!value || typeof value !== "object") throw new Error("OPC 服务目录状态无效。");
  const record = value as Partial<ManagedServiceCatalog>;
  const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) {
    throw new Error("OPC 服务目录 schemaVersion 无效。");
  }
  const migrateLegacyRangerIdentities = schemaVersion === 1;
  if (!migrateLegacyRangerIdentities) {
    for (const [label, catalog] of [["草稿", record.draft], ["当前发布目录", record.published]] as const) {
      const item = catalog && typeof catalog === "object" ? catalog as Record<string, unknown> : null;
      if (!item || !Array.isArray(item.rangerIdentities)) {
        throw new Error(`OPC schema v2 ${label}缺少顾问身份数组。`);
      }
    }
  }
  const draft = normalizeOpcCatalog(record.draft, {
    migrateLegacyRangerIdentities,
    migrateLegacyDescriptions: catalogNeedsDescriptionMigration(record.draft),
  });
  const published = normalizeOpcCatalog(record.published, {
    migrateLegacyRangerIdentities,
    migrateLegacyDescriptions: catalogNeedsDescriptionMigration(record.published),
  });
  const untouchedPreview = record.revision === 1
    && record.draftUpdatedAt == null
    && record.publishedAt == null
    && (!Array.isArray(record.publications) || record.publications.length === 0);
  if (untouchedPreview) {
    const currentCatalog = createDefaultOpcCatalog();
    draft.infrastructure = structuredClone(currentCatalog.infrastructure);
    draft.specialties = structuredClone(currentCatalog.specialties);
    draft.serviceCategoryDescriptions = structuredClone(currentCatalog.serviceCategoryDescriptions);
    draft.rangerIdentities = structuredClone(currentCatalog.rangerIdentities);
    draft.rangers = structuredClone(currentCatalog.rangers);
    published.infrastructure = structuredClone(currentCatalog.infrastructure);
    published.specialties = structuredClone(currentCatalog.specialties);
    published.serviceCategoryDescriptions = structuredClone(currentCatalog.serviceCategoryDescriptions);
    published.rangerIdentities = structuredClone(currentCatalog.rangerIdentities);
    published.rangers = structuredClone(currentCatalog.rangers);
  } else {
    draft.rangers = draft.rangers.filter((ranger) => !isLegacyPreviewRanger(ranger));
    published.rangers = retainVerifiedPublicRangers(published.rangers);
  }
  const draftValidation = validateOpcCatalog(draft);
  const publishedValidation = validateOpcCatalog(published, typeof record.publishedAt === "string");
  if (!draftValidation.valid || !publishedValidation.valid) {
    throw new Error(`OPC 服务目录数据损坏：${[...draftValidation.errors, ...publishedValidation.errors].slice(0, 3).join("；")}`);
  }
  const publications = Array.isArray(record.publications)
    ? record.publications.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as { revision?: unknown; publishedAt?: unknown; catalog?: unknown };
      if (!Number.isSafeInteger(item.revision) || typeof item.publishedAt !== "string") return [];
      if (!migrateLegacyRangerIdentities) {
        const historicalCatalog = item.catalog && typeof item.catalog === "object"
          ? item.catalog as Record<string, unknown>
          : null;
        if (!historicalCatalog || !Array.isArray(historicalCatalog.rangerIdentities)) {
          throw new Error("OPC schema v2 历史发布快照缺少顾问身份数组。");
        }
      }
      const catalog = normalizeOpcCatalog(item.catalog, {
        migrateLegacyRangerIdentities,
        migrateLegacyDescriptions: catalogNeedsDescriptionMigration(item.catalog),
      });
      catalog.rangers = retainVerifiedPublicRangers(catalog.rangers);
      return validateOpcCatalog(catalog, true).valid
        ? [{ revision: Number(item.revision), publishedAt: item.publishedAt, catalog }]
        : [];
    })
    : [];
  return {
    schemaVersion: 2,
    revision: Number.isSafeInteger(record.revision) && Number(record.revision) > 0 ? Number(record.revision) : 1,
    draftUpdatedAt: typeof record.draftUpdatedAt === "string" ? record.draftUpdatedAt : null,
    publishedAt: typeof record.publishedAt === "string" ? record.publishedAt : null,
    draft,
    published,
    publications,
  };
}

function legacyIdentityName(profile: RangerProfile, identities: RangerIdentity[]) {
  const identity = identities.find((candidate) => candidate.id === profile.identityId);
  if (identity && legacyRangerIdentityNames.has(identity.name)) return identity.name;
  return defaultRangerIdentities.find((candidate) => candidate.id === profile.identityId)?.name
    ?? legacyRangerIdentityFallback;
}

function serializeCatalogForPreviousRelease(catalog: OpcCatalogContent) {
  return {
    ...catalog,
    rangers: catalog.rangers.map((profile) => ({
      ...profile,
      identity: legacyIdentityName(profile, catalog.rangerIdentities),
    })),
  };
}

function serializeManagedServiceCatalog(state: ManagedServiceCatalog) {
  return {
    ...state,
    draft: serializeCatalogForPreviousRelease(state.draft),
    published: serializeCatalogForPreviousRelease(state.published),
    publications: state.publications.map((publication) => ({
      ...publication,
      catalog: serializeCatalogForPreviousRelease(publication.catalog),
    })),
  };
}

const definition: StateDocumentDefinition<ManagedServiceCatalog> = {
  namespace: "opc-service-catalog",
  fileName: "opc-service-catalog.json",
  create: initialState,
  parse: parseState,
  serialize: serializeManagedServiceCatalog,
};

export async function readPublishedServiceCatalog() {
  const state = await readStateDocument(definition);
  return structuredClone(state.published);
}

export async function readManagedServiceCatalog() {
  const state = await readStateDocument(definition);
  const { publications, ...current } = structuredClone(state);
  return {
    ...current,
    publicationHistory: publications.map((publication) => ({
      revision: publication.revision,
      publishedAt: publication.publishedAt,
      infrastructure: publication.catalog.infrastructure.length,
      specialties: publication.catalog.specialties.length,
      rangerIdentities: publication.catalog.rangerIdentities.length,
      rangers: publication.catalog.rangers.length,
    })),
    validation: validateOpcCatalog(state.draft, true),
  };
}

export async function saveServiceCatalogDraft(catalog: unknown, expectedRevision: number) {
  const normalized = normalizeCatalogMutation(catalog);
  const validation = validateOpcCatalog(normalized);
  if (!validation.valid) throw new ServiceCatalogValidationError(validation.errors);
  return mutateStateDocument(definition, (state) => {
    if (state.revision !== expectedRevision) throw new ServiceCatalogConflictError();
    const legacyErrors = legacyAvatarWriteErrors(normalized, state.draft);
    if (legacyErrors.length) throw new ServiceCatalogValidationError(legacyErrors);
    state.draft = normalized;
    state.revision += 1;
    state.draftUpdatedAt = new Date().toISOString();
    return {
      revision: state.revision,
      draftUpdatedAt: state.draftUpdatedAt,
      validation: validateOpcCatalog(state.draft, true),
    };
  });
}

export async function publishServiceCatalog(catalog: unknown, expectedRevision: number) {
  const normalized = normalizeCatalogMutation(catalog);
  const validation = validateOpcCatalog(normalized, true);
  if (!validation.valid) throw new ServiceCatalogValidationError(validation.errors);
  const missingAvatarObjects = (
    await Promise.all(normalized.rangers.flatMap((ranger) => ranger.avatar
      ? [missingRangerAvatarObjectKeys(ranger.avatar)]
      : []))
  ).flat();
  if (missingAvatarObjects.length) {
    throw new ServiceCatalogValidationError([
      `游骑兵头像对象不存在，请重新上传后再发布：${missingAvatarObjects.slice(0, 4).join("，")}`,
    ]);
  }
  return mutateStateDocument(definition, async (state) => {
    if (state.revision !== expectedRevision) throw new ServiceCatalogConflictError();
    const legacyErrors = legacyAvatarWriteErrors(normalized, state.draft);
    if (legacyErrors.length) throw new ServiceCatalogValidationError(legacyErrors);
    const now = new Date().toISOString();
    state.draft = structuredClone(normalized);
    state.published = structuredClone(normalized);
    state.revision += 1;
    state.draftUpdatedAt = now;
    state.publishedAt = now;
    state.publications.push({
      revision: state.revision,
      publishedAt: now,
      catalog: structuredClone(normalized),
    });
    if (shouldSyncLocalSeedOnPublish()) {
      await writePublishedSeed(normalized, state.revision, now);
    }
    return {
      revision: state.revision,
      draftUpdatedAt: now,
      publishedAt: now,
      validation: { valid: true, errors: [] },
    };
  });
}

export async function syncPublishedServiceCatalogSeed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产进程不允许把 PostgreSQL 运行数据写回部署包中的 OPC seed。");
  }
  const state = await readStateDocument(definition);
  const target = await writePublishedSeed(state.published, state.revision, state.publishedAt);
  return {
    target,
    revision: state.revision,
    publishedAt: state.publishedAt,
    matchesDefaultPath: target === opcCatalogSeedPath(),
  };
}

export async function cleanupRangerAvatarMedia(now = new Date()) {
  const state = await readStateDocument(definition);
  const activeKeys = new Set([
    ...rangerAvatarKeys(state.draft),
    ...rangerAvatarKeys(state.published),
  ]);
  const historicalReference = new Map<string, number>();
  for (const publication of state.publications) {
    const publishedAt = Date.parse(publication.publishedAt);
    if (!Number.isFinite(publishedAt)) continue;
    for (const key of rangerAvatarKeys(publication.catalog)) {
      historicalReference.set(key, Math.max(historicalReference.get(key) ?? 0, publishedAt));
    }
  }

  const deleted: string[] = [];
  const retained: string[] = [];
  for (const object of await listRangerMediaObjects()) {
    if (activeKeys.has(object.key)) {
      retained.push(object.key);
      continue;
    }
    const modifiedAt = Date.parse(object.lastModified);
    if (!Number.isFinite(modifiedAt)) {
      retained.push(object.key);
      continue;
    }
    const historicalAt = historicalReference.get(object.key);
    const retentionMs = historicalAt === undefined
      ? RANGER_AVATAR_ORPHAN_RETENTION_MS
      : RANGER_AVATAR_REPLACED_RETENTION_MS;
    const retentionAnchor = Math.max(modifiedAt, historicalAt ?? 0);
    if (now.getTime() - retentionAnchor < retentionMs) {
      retained.push(object.key);
      continue;
    }
    await deleteRangerMediaObject(object.key);
    deleted.push(object.key);
  }
  return { deleted, retained };
}

export async function purgeRangerAvatarMediaAfterRevocation(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();
  const state = await readStateDocument(definition);
  const stillReferenced = [...state.draft.rangers, ...state.published.rangers]
    .some((ranger) => ranger.slug === normalizedSlug && (ranger.avatar || ranger.avatarUrl));
  if (stillReferenced) {
    throw new Error("永久删除头像前必须先从草稿和公开目录移除该游骑兵头像并完成发布。");
  }
  return deleteRangerMediaObjectsForSlug(normalizedSlug);
}
