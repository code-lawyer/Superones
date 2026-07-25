import "server-only";

import {
  createDefaultOpcCatalog,
  rangerIdentities,
  specialtyDomains,
  type OpcCatalogContent,
  type OpcService,
  type RangerProfile,
} from "./opc-catalog.ts";
import { mutateStateDocument, readStateDocument, type StateDocumentDefinition } from "./state-document-store.ts";

export type ManagedServiceCatalog = {
  schemaVersion: 1;
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

const infrastructureGroups = ["建立经营底座", "持续安全运行", "构建与交付"] as const;
const placeholderValues = new Set([
  "待专业确认",
  "内容建模中",
  "PROFILE PREVIEW",
  "联系方式将在本人确认后公开",
  "待核验",
  "本人授权待确认",
]);
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function initialState(): ManagedServiceCatalog {
  const defaults = createDefaultOpcCatalog();
  return {
    schemaVersion: 1,
    revision: 1,
    draftUpdatedAt: null,
    publishedAt: null,
    draft: structuredClone(defaults),
    published: structuredClone(defaults),
    publications: [],
  };
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
    boundary: cleanText(item.boundary, 500),
    price: cleanText(item.price, 100),
    period: cleanText(item.period, 100),
    revision: cleanText(item.revision, 40),
    status: cleanText(item.status, 40),
    effectiveAt: cleanText(item.effectiveAt, 40),
    reviewNote: cleanText(item.reviewNote, 300),
  };
}

function normalizeRanger(value: unknown): RangerProfile {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    slug: cleanText(item.slug, 80).toLowerCase(),
    publicName: cleanText(item.publicName, 120),
    identity: cleanText(item.identity, 60),
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

export function normalizeOpcCatalog(value: unknown): OpcCatalogContent {
  const catalog = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    infrastructure: Array.isArray(catalog.infrastructure)
      ? catalog.infrastructure.slice(0, 50).map((item) => normalizeService(item, "infrastructure"))
      : [],
    specialties: Array.isArray(catalog.specialties)
      ? catalog.specialties.slice(0, 200).map((item) => normalizeService(item, "specialty"))
      : [],
    rangers: Array.isArray(catalog.rangers)
      ? catalog.rangers.slice(0, 200).map(normalizeRanger)
      : [],
  };
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

  if (forPublication && catalog.infrastructure.length === 0) errors.push("基础设施至少需要一个已发布项目");
  if (forPublication && catalog.specialties.length === 0) errors.push("专项服务至少需要一个已发布项目");

  for (const service of services) {
    const label = service.name || service.code || "未命名服务";
    required(errors, `${label}：slug`, service.slug);
    required(errors, `${label}：编号`, service.code);
    required(errors, `${label}：名称`, service.name);
    required(errors, `${label}：一句话结果`, service.outcome);
    required(errors, `${label}：适用对象`, service.audience);
    required(errors, `${label}：转交边界`, service.boundary);
    if (service.slug && !slugPattern.test(service.slug)) errors.push(`${label}：slug 只能使用小写字母、数字和连字符`);
    const routeKey = `${service.kind}:${service.slug}`;
    if (slugs.has(routeKey)) errors.push(`${label}：slug 重复`);
    slugs.add(routeKey);
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
    if (forPublication) {
      for (const [field, value] of [
        ["价格", service.price],
        ["周期", service.period],
        ["修订", service.revision],
        ["状态", service.status],
        ["生效时间", service.effectiveAt],
        ["专业复核", service.reviewNote],
      ] as const) {
        required(errors, `${label}：${field}`, value);
        if (placeholderValues.has(value)) errors.push(`${label}：${field}仍是预览占位值`);
      }
      if (service.effectiveAt && !isIsoDate(service.effectiveAt)) {
        errors.push(`${label}：生效时间必须使用 YYYY-MM-DD`);
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
    if (!rangerIdentities.includes(ranger.identity as never)) errors.push(`${label}：顾问身份无效`);
    if (!ranger.tags.length) errors.push(`${label}：至少填写一个专长标签`);
    if (forPublication && placeholderValues.has(ranger.contactLabel)) errors.push(`${label}：联系方式仍是预览占位值`);
    if (forPublication && placeholderValues.has(ranger.contactState)) errors.push(`${label}：联系状态仍是预览占位值`);
    if (forPublication) {
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

function parseState(value: unknown): ManagedServiceCatalog {
  if (!value || typeof value !== "object") throw new Error("OPC 服务目录状态无效。");
  const record = value as Partial<ManagedServiceCatalog>;
  const draft = normalizeOpcCatalog(record.draft);
  const published = normalizeOpcCatalog(record.published);
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
      const catalog = normalizeOpcCatalog(item.catalog);
      return validateOpcCatalog(catalog, true).valid
        ? [{ revision: Number(item.revision), publishedAt: item.publishedAt, catalog }]
        : [];
    })
    : [];
  return {
    schemaVersion: 1,
    revision: Number.isSafeInteger(record.revision) && Number(record.revision) > 0 ? Number(record.revision) : 1,
    draftUpdatedAt: typeof record.draftUpdatedAt === "string" ? record.draftUpdatedAt : null,
    publishedAt: typeof record.publishedAt === "string" ? record.publishedAt : null,
    draft,
    published,
    publications,
  };
}

const definition: StateDocumentDefinition<ManagedServiceCatalog> = {
  namespace: "opc-service-catalog",
  fileName: "opc-service-catalog.json",
  create: initialState,
  parse: parseState,
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
      rangers: publication.catalog.rangers.length,
    })),
    validation: validateOpcCatalog(state.draft, true),
  };
}

export async function saveServiceCatalogDraft(catalog: unknown, expectedRevision: number) {
  const normalized = normalizeOpcCatalog(catalog);
  const validation = validateOpcCatalog(normalized);
  if (!validation.valid) throw new ServiceCatalogValidationError(validation.errors);
  return mutateStateDocument(definition, (state) => {
    if (state.revision !== expectedRevision) throw new ServiceCatalogConflictError();
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
  const normalized = normalizeOpcCatalog(catalog);
  const validation = validateOpcCatalog(normalized, true);
  if (!validation.valid) throw new ServiceCatalogValidationError(validation.errors);
  return mutateStateDocument(definition, (state) => {
    if (state.revision !== expectedRevision) throw new ServiceCatalogConflictError();
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
    return {
      revision: state.revision,
      draftUpdatedAt: now,
      publishedAt: now,
      validation: { valid: true, errors: [] },
    };
  });
}
