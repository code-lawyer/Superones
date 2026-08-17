import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  RANGER_SIGNATURE_MAX_LENGTH,
  type OpcService,
  type RangerProfile,
} from "../lib/opc-catalog.ts";

function rangerFixture(overrides: Partial<RangerProfile> = {}): RangerProfile {
  return {
    slug: "verified-legal-advisor",
    publicName: "经授权的法律顾问",
    identityId: "legal-advisor",
    signature: "让复杂问题回到可以行动的尺度。",
    intro: "处理商业交易与经营风险问题。",
    tags: ["商业交易"],
    credential: "公开职业记录。",
    contactLabel: "legal-advisor@example.com",
    contactState: "EMAIL / PUBLIC",
    verificationDate: "2099-01-01",
    profileUpdatedAt: "2099-01-01",
    authorizationStatus: "本人已授权公开",
    ...overrides,
  };
}

test("OPC service catalog keeps drafts private until an atomic validated publish", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-catalog-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  const previousSeedPath = process.env.VAULT2077_OPC_SEED_PATH;
  const previousSeedSync = process.env.VAULT2077_SYNC_LOCAL_SEED_ON_PUBLISH;
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_OPC_SEED_PATH = path.join(root, "defaults", "opc-catalog.seed.json");
  process.env.VAULT2077_SYNC_LOCAL_SEED_ON_PUBLISH = "true";
  try {
    const {
      publishServiceCatalog,
      readManagedServiceCatalog,
      readPublishedServiceCatalog,
      saveServiceCatalogDraft,
      ServiceCatalogConflictError,
      ServiceCatalogValidationError,
    } = await import(`../lib/managed-service-catalog.ts?test=${Date.now()}`);

    const initial = await readManagedServiceCatalog();
    const incompleteCatalog = structuredClone(initial.draft) as unknown as Record<string, unknown>;
    delete incompleteCatalog.rangerIdentities;
    await assert.rejects(
      saveServiceCatalogDraft(incompleteCatalog, initial.revision),
      (error: unknown) => error instanceof Error
        && error.name === ServiceCatalogValidationError.name
        && error.message.includes("必须包含服务分类说明和顾问身份数组"),
    );
    const missingDescriptions = structuredClone(initial.draft) as unknown as Record<string, unknown>;
    delete missingDescriptions.serviceCategoryDescriptions;
    await assert.rejects(
      saveServiceCatalogDraft(missingDescriptions, initial.revision),
      (error: unknown) => error instanceof Error
        && error.name === ServiceCatalogValidationError.name
        && error.message.includes("必须包含服务分类说明和顾问身份数组"),
    );
    const legacyWrite = structuredClone(initial.draft);
    legacyWrite.rangers.push(rangerFixture({ avatarUrl: "data:image/png;base64,AAAA" }));
    await assert.rejects(
      saveServiceCatalogDraft(legacyWrite, initial.revision),
      (error: unknown) => error instanceof Error
        && error.name === ServiceCatalogValidationError.name
        && error.message.includes("只允许读取"),
    );
    const draft = structuredClone(initial.draft);
    draft.infrastructure[0].name = "已修改但未发布的服务";
    draft.rangers.push(rangerFixture({ contactState: "PROFILE PREVIEW" }));
    const saved = await saveServiceCatalogDraft(draft, initial.revision);

    assert.equal((await readPublishedServiceCatalog()).infrastructure[0].name, "经营主体启动与首年治理");
    const savedDraft = (await readManagedServiceCatalog()).draft;
    assert.equal(savedDraft.infrastructure[0].name, "已修改但未发布的服务");
    assert.equal(savedDraft.rangers[0].signature, "让复杂问题回到可以行动的尺度。");
    await assert.rejects(
      publishServiceCatalog(draft, saved.revision),
      ServiceCatalogValidationError,
    );

    const publishable = structuredClone(draft);
    publishable.infrastructure = publishable.infrastructure.map((service: OpcService) => ({
      ...service,
      price: "人民币 1,000 元",
      period: "5 个工作日",
      status: "公开服务",
    }));
    publishable.specialties = publishable.specialties.map((service: OpcService) => ({
      ...service,
      price: "人民币 500 元",
      period: "3 个工作日",
      status: "公开服务",
    }));
    publishable.rangers = publishable.rangers.map((ranger: RangerProfile, index: number) => ({
      ...ranger,
      contactLabel: `ranger-${index + 1}@example.com`,
      contactState: "EMAIL / PUBLIC",
      verificationDate: "2099-01-01",
      profileUpdatedAt: "2099-01-01",
      authorizationStatus: "本人已授权公开",
    }));

    const published = await publishServiceCatalog(publishable, saved.revision);
    const publishedCatalog = await readPublishedServiceCatalog();
    assert.equal(publishedCatalog.infrastructure[0].name, "已修改但未发布的服务");
    assert.equal(publishedCatalog.rangers[0].signature, "让复杂问题回到可以行动的尺度。");
    const seed = JSON.parse(await readFile(process.env.VAULT2077_OPC_SEED_PATH, "utf8"));
    assert.equal(seed.schemaVersion, 2);
    assert.equal(seed.sourceRevision, published.revision);
    assert.equal(seed.publishedAt, published.publishedAt);
    assert.equal(seed.catalog.infrastructure[0].name, "已修改但未发布的服务");
    assert.equal(seed.catalog.serviceCategoryDescriptions.length, 9);
    assert.equal(seed.catalog.rangerIdentities[0].description, "合同、治理与经营风险的独立专业支持");
    assert.equal(seed.catalog.rangers[0].signature, "让复杂问题回到可以行动的尺度。");
    await assert.rejects(
      saveServiceCatalogDraft(publishable, saved.revision),
      ServiceCatalogConflictError,
    );
    assert.equal((await readManagedServiceCatalog()).revision, published.revision);
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
    if (previousSeedPath === undefined) delete process.env.VAULT2077_OPC_SEED_PATH;
    else process.env.VAULT2077_OPC_SEED_PATH = previousSeedPath;
    if (previousSeedSync === undefined) delete process.env.VAULT2077_SYNC_LOCAL_SEED_ON_PUBLISH;
    else process.env.VAULT2077_SYNC_LOCAL_SEED_ON_PUBLISH = previousSeedSync;
    await rm(root, { recursive: true, force: true });
  }
});

test("OPC service catalog rejects an uncontrolled specialty taxonomy", async () => {
  const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
  const { normalizeOpcCatalog, validateOpcCatalog } = await import("../lib/managed-service-catalog.ts");
  const catalog = createDefaultOpcCatalog();
  catalog.specialties[0].domain = "随意新增的自动内容栏目";
  const result = validateOpcCatalog(normalizeOpcCatalog(catalog));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("专项服务领域无效")));
});

test("OPC service category descriptions keep the controlled set and order", async () => {
  const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
  const { normalizeOpcCatalog, validateOpcCatalog } = await import("../lib/managed-service-catalog.ts");
  const reordered = createDefaultOpcCatalog();
  [reordered.serviceCategoryDescriptions[0], reordered.serviceCategoryDescriptions[1]] = [
    reordered.serviceCategoryDescriptions[1],
    reordered.serviceCategoryDescriptions[0],
  ];
  const reorderedResult = validateOpcCatalog(normalizeOpcCatalog(reordered));
  assert.equal(reorderedResult.valid, false);
  assert.ok(reorderedResult.errors.some((error) => error.includes("分类顺序无效")));

  const uncontrolled = createDefaultOpcCatalog();
  uncontrolled.serviceCategoryDescriptions[0].section = "uncontrolled" as "infrastructure";
  const uncontrolledResult = validateOpcCatalog(normalizeOpcCatalog(uncontrolled));
  assert.equal(uncontrolledResult.valid, false);
  assert.ok(uncontrolledResult.errors.some((error) => error.includes("不是受控的 OPC 服务分类")));
});

test("OPC service catalog requires globally unique service slugs", async () => {
  const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
  const { normalizeOpcCatalog, validateOpcCatalog } = await import("../lib/managed-service-catalog.ts");
  const catalog = createDefaultOpcCatalog();
  catalog.specialties[0].slug = catalog.infrastructure[0].slug;
  const result = validateOpcCatalog(normalizeOpcCatalog(catalog));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("全部 OPC 服务中保持唯一")));
});

test("OPC service catalog initializes an empty local store from the tracked seed", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-seed-bootstrap-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  const previousSeedPath = process.env.VAULT2077_OPC_SEED_PATH;
  process.env.VAULT2077_DATA_DIR = path.join(root, "runtime");
  process.env.VAULT2077_OPC_SEED_PATH = path.join(root, "defaults", "opc-catalog.seed.json");
  try {
    const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
    const catalog = createDefaultOpcCatalog();
    catalog.infrastructure[0].name = "来自受跟踪 seed 的默认服务";
    await mkdir(path.dirname(process.env.VAULT2077_OPC_SEED_PATH), { recursive: true });
    await writeFile(
      process.env.VAULT2077_OPC_SEED_PATH,
      `${JSON.stringify({
        schemaVersion: 1,
        sourceRevision: 7,
        publishedAt: null,
        catalog,
      }, null, 2)}\n`,
    );

    const { readManagedServiceCatalog } = await import(
      `../lib/managed-service-catalog.ts?seed-bootstrap=${Date.now()}`
    );
    const initialized = await readManagedServiceCatalog();
    assert.equal(initialized.revision, 7);
    assert.equal(initialized.published.infrastructure[0].name, "来自受跟踪 seed 的默认服务");
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    if (previousSeedPath === undefined) delete process.env.VAULT2077_OPC_SEED_PATH;
    else process.env.VAULT2077_OPC_SEED_PATH = previousSeedPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("OPC service catalog refreshes infrastructure in an untouched local preview", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-preview-refresh-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  const previousSeedPath = process.env.VAULT2077_OPC_SEED_PATH;
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_OPC_SEED_PATH = path.join(root, "missing-seed.json");
  try {
    const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
    const stale = createDefaultOpcCatalog();
    stale.infrastructure = stale.infrastructure.slice(0, 5);
    stale.infrastructure[0].name = "旧基础设施预览";
    await writeFile(
      path.join(root, "opc-service-catalog.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        revision: 1,
        draftUpdatedAt: null,
        publishedAt: null,
        draft: stale,
        published: stale,
        publications: [],
      }, null, 2)}\n`,
    );

    const { readManagedServiceCatalog, readPublishedServiceCatalog } = await import(
      `../lib/managed-service-catalog.ts?preview-refresh=${Date.now()}`
    );
    const managed = await readManagedServiceCatalog();
    const published = await readPublishedServiceCatalog();
    assert.equal(managed.draft.infrastructure.length, 7);
    assert.equal(managed.draft.specialties.length, 14);
    assert.equal(published.infrastructure.length, 7);
    assert.equal(published.specialties.length, 14);
    assert.equal(published.infrastructure[0].name, "经营主体启动与首年治理");
    assert.equal(published.rangers.length, 0);
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    if (previousSeedPath === undefined) delete process.env.VAULT2077_OPC_SEED_PATH;
    else process.env.VAULT2077_OPC_SEED_PATH = previousSeedPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("OPC service catalog removes legacy ranger previews instead of fabricating authorization", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-ranger-preview-repair-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  const previousSeedPath = process.env.VAULT2077_OPC_SEED_PATH;
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_OPC_SEED_PATH = path.join(root, "missing-seed.json");
  try {
    const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
    const staleDraft = createDefaultOpcCatalog();
    staleDraft.rangers.push(rangerFixture({
      slug: "ranger-legal-preview",
      publicName: "公开档案示例 A01",
      contactLabel: "联系方式将在本人确认后公开",
      contactState: "PROFILE PREVIEW",
      verificationDate: undefined,
      profileUpdatedAt: undefined,
      authorizationStatus: "本人授权待确认",
    }));
    const stalePublished = structuredClone(staleDraft);
    await writeFile(
      path.join(root, "opc-service-catalog.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        revision: 2,
        draftUpdatedAt: "2099-01-01T00:00:00.000Z",
        publishedAt: null,
        draft: staleDraft,
        published: stalePublished,
        publications: [],
      }, null, 2)}\n`,
    );

    const { readManagedServiceCatalog, readPublishedServiceCatalog } = await import(
      `../lib/managed-service-catalog.ts?ranger-preview-repair=${Date.now()}`
    );
    const managed = await readManagedServiceCatalog();
    const published = await readPublishedServiceCatalog();
    assert.equal(managed.draft.rangers.length, 0);
    assert.equal(published.rangers.length, 0);
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    if (previousSeedPath === undefined) delete process.env.VAULT2077_OPC_SEED_PATH;
    else process.env.VAULT2077_OPC_SEED_PATH = previousSeedPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("OPC service catalog preserves verified rangers and removes legacy previews from history", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-ranger-published-migration-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  const previousSeedPath = process.env.VAULT2077_OPC_SEED_PATH;
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_OPC_SEED_PATH = path.join(root, "missing-seed.json");
  try {
    const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
    const legacy = createDefaultOpcCatalog();
    legacy.rangers = [
      rangerFixture({
        slug: "ranger-legal-preview",
        publicName: "公开档案示例 A01",
        contactLabel: "公开联系入口 1",
        contactState: "本人已授权",
      }),
      rangerFixture({
      slug: "custom-advisor",
      publicName: "真实授权专家",
      intro: "真实授权专家公开简介。",
      contactLabel: "custom-advisor@example.com",
      }),
    ];
    await writeFile(
      path.join(root, "opc-service-catalog.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        revision: 3,
        draftUpdatedAt: "2099-01-02T00:00:00.000Z",
        publishedAt: "2099-01-02T00:00:00.000Z",
        draft: legacy,
        published: legacy,
        publications: [{
          revision: 3,
          publishedAt: "2099-01-02T00:00:00.000Z",
          catalog: legacy,
        }],
      }, null, 2)}\n`,
    );

    const { readManagedServiceCatalog, readPublishedServiceCatalog } = await import(
      `../lib/managed-service-catalog.ts?ranger-published-migration=${Date.now()}`
    );
    const managed = await readManagedServiceCatalog();
    const published = await readPublishedServiceCatalog();
    assert.equal(managed.draft.rangers.length, 1);
    assert.equal(published.rangers.length, 1);
    assert.equal(published.rangers[0].slug, "custom-advisor");
    assert.equal(published.rangers[0].contactLabel, "custom-advisor@example.com");
    assert.equal(published.rangers[0].publicName, "真实授权专家");
    assert.equal(managed.publicationHistory.length, 1);
    assert.equal(managed.publicationHistory[0].revision, 3);
    assert.equal(managed.publicationHistory[0].rangers, 1);
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    if (previousSeedPath === undefined) delete process.env.VAULT2077_OPC_SEED_PATH;
    else process.env.VAULT2077_OPC_SEED_PATH = previousSeedPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("OPC publication requires authorized public ranger emails", async () => {
  const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
  const { normalizeOpcCatalog, validateOpcCatalog } = await import("../lib/managed-service-catalog.ts");
  const catalog = createDefaultOpcCatalog();
  catalog.rangers.push(rangerFixture());
  catalog.rangers[0].contactLabel = "公开联系入口";
  catalog.rangers[0].contactState = "PROFILE PREVIEW";
  catalog.rangers[0].authorizationStatus = "待确认";
  catalog.rangers[0].verificationDate = "tomorrow";
  catalog.rangers[0].profileUpdatedAt = "2099-13-01";
  const result = validateOpcCatalog(normalizeOpcCatalog(catalog), true);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("联系方式必须是公开邮箱")));
  assert.ok(result.errors.some((error) => error.includes("联系状态必须是 EMAIL / PUBLIC")));
  assert.ok(result.errors.some((error) => error.includes("授权状态必须是本人已授权公开")));
  assert.ok(result.errors.some((error) => error.includes("核验日期必须使用 YYYY-MM-DD")));
  assert.ok(result.errors.some((error) => error.includes("资料更新时间必须使用 YYYY-MM-DD")));

  for (const contactLabel of [
    "ranger@example.com?subject=咨询",
    "ranger@example.com,other@example.com",
    ".ranger@example.com",
    "ranger.@example.com",
    "a..b@example.com",
  ]) {
    const unsafeCatalog = createDefaultOpcCatalog();
    unsafeCatalog.rangers.push(rangerFixture());
    unsafeCatalog.rangers[0].contactLabel = contactLabel;
    const unsafeResult = validateOpcCatalog(normalizeOpcCatalog(unsafeCatalog), true);
    assert.equal(unsafeResult.valid, false);
    assert.ok(unsafeResult.errors.some((error) => error.includes("联系方式必须是公开邮箱")));
  }
});

test("OPC service catalog accepts managed ranger identities and rejects orphaned profiles", async () => {
  const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
  const { normalizeOpcCatalog, validateOpcCatalog } = await import("../lib/managed-service-catalog.ts");
  const catalog = createDefaultOpcCatalog();
  catalog.rangerIdentities.push({ id: "people-advisor", name: "人才与组织顾问", description: "组织设计、人才配置与协作机制支持" });
  catalog.rangers.push(rangerFixture({ identityId: "people-advisor" }));

  const managed = normalizeOpcCatalog(catalog);
  assert.equal(validateOpcCatalog(managed, true).valid, true);

  managed.rangerIdentities = managed.rangerIdentities.filter((identity) => identity.id !== "people-advisor");
  const orphaned = validateOpcCatalog(managed, true);
  assert.equal(orphaned.valid, false);
  assert.ok(orphaned.errors.some((error) => error.includes("引用的顾问身份不存在")));
});

test("OPC service catalog allows empty identity removal, rename and reorder", async () => {
  const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
  const { normalizeOpcCatalog, validateOpcCatalog } = await import("../lib/managed-service-catalog.ts");
  const catalog = createDefaultOpcCatalog();
  const moved = catalog.rangerIdentities.pop();
  assert.ok(moved);
  catalog.rangerIdentities.unshift({ ...moved, name: "AI 工程专家" });

  const normalized = normalizeOpcCatalog(catalog);
  assert.equal(validateOpcCatalog(normalized, true).valid, true);
  assert.equal(normalized.rangerIdentities[0].id, moved.id);
  assert.equal(normalized.rangerIdentities[0].name, "AI 工程专家");
});

test("OPC state schema v1 migrates identity labels across current and historical snapshots", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-identity-v1-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  const previousSeedPath = process.env.VAULT2077_OPC_SEED_PATH;
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_OPC_SEED_PATH = path.join(root, "missing-seed.json");
  try {
    const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
    const legacy = createDefaultOpcCatalog() as unknown as Record<string, unknown>;
    delete legacy.rangerIdentities;
    const legacyRanger = rangerFixture() as unknown as Record<string, unknown>;
    legacyRanger.identity = "法律顾问";
    delete legacyRanger.identityId;
    legacy.rangers = [legacyRanger];
    await writeFile(
      path.join(root, "opc-service-catalog.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        revision: 14,
        draftUpdatedAt: "2099-01-02T00:00:00.000Z",
        publishedAt: "2099-01-02T00:00:00.000Z",
        draft: legacy,
        published: legacy,
        publications: [{ revision: 14, publishedAt: "2099-01-02T00:00:00.000Z", catalog: legacy }],
      }, null, 2)}\n`,
    );

    const { readManagedServiceCatalog, readPublishedServiceCatalog, saveServiceCatalogDraft } = await import(
      `../lib/managed-service-catalog.ts?identity-v1=${Date.now()}`
    );
    const managed = await readManagedServiceCatalog();
    const published = await readPublishedServiceCatalog();
    assert.equal(managed.schemaVersion, 2);
    assert.equal(managed.draft.rangerIdentities.length, 10);
    assert.equal(managed.draft.serviceCategoryDescriptions.length, 9);
    assert.equal(managed.draft.rangerIdentities[0].description, "合同、治理与经营风险的独立专业支持");
    assert.equal(published.rangers[0].identityId, "legal-advisor");
    assert.equal(managed.publicationHistory[0].rangerIdentities, 10);

    const migratedDraft = structuredClone(managed.draft);
    migratedDraft.rangerIdentities.push({ id: "people-advisor", name: "人才与组织顾问", description: "组织设计、人才配置与协作机制支持" });
    migratedDraft.rangers.push(rangerFixture({
      slug: "verified-people-advisor",
      publicName: "经授权的人才顾问",
      identityId: "people-advisor",
    }));
    await saveServiceCatalogDraft(migratedDraft, managed.revision);
    const persisted = JSON.parse(await readFile(path.join(root, "opc-service-catalog.json"), "utf8"));
    assert.equal(persisted.schemaVersion, 2);
    assert.equal(persisted.draft.rangerIdentities[0].id, "legal-advisor");
    assert.equal(persisted.draft.serviceCategoryDescriptions[0].description, "主体设立、财税启用与首年治理");
    assert.equal(persisted.draft.rangerIdentities[0].description, "合同、治理与经营风险的独立专业支持");
    assert.equal(persisted.draft.rangers[0].identityId, "legal-advisor");
    assert.equal(persisted.draft.rangers[0].identity, "法律顾问");
    assert.equal(persisted.draft.rangers[1].identityId, "people-advisor");
    assert.equal(persisted.draft.rangers[1].identity, "创业顾问");
    assert.equal(persisted.publications[0].catalog.rangers[0].identityId, "legal-advisor");
    const runtimeDraft = (await readManagedServiceCatalog()).draft as unknown as { rangers: Array<Record<string, unknown>> };
    assert.equal("identity" in runtimeDraft.rangers[0], false);
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    if (previousSeedPath === undefined) delete process.env.VAULT2077_OPC_SEED_PATH;
    else process.env.VAULT2077_OPC_SEED_PATH = previousSeedPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("OPC schema v2 catalogs gain authored category descriptions without weakening complete writes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-description-v2-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  const previousSeedPath = process.env.VAULT2077_OPC_SEED_PATH;
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_OPC_SEED_PATH = path.join(root, "missing-seed.json");
  try {
    const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
    const legacyCatalog = createDefaultOpcCatalog() as unknown as Record<string, unknown>;
    delete legacyCatalog.serviceCategoryDescriptions;
    legacyCatalog.rangerIdentities = (legacyCatalog.rangerIdentities as Array<Record<string, unknown>>).map((identity) => {
      const legacyIdentity = { ...identity };
      delete legacyIdentity.description;
      return legacyIdentity;
    });
    const publishedAt = "2099-01-02T00:00:00.000Z";
    await writeFile(
      path.join(root, "opc-service-catalog.json"),
      `${JSON.stringify({
        schemaVersion: 2,
        revision: 9,
        draftUpdatedAt: publishedAt,
        publishedAt,
        draft: legacyCatalog,
        published: legacyCatalog,
        publications: [{ revision: 9, publishedAt, catalog: legacyCatalog }],
      }, null, 2)}\n`,
    );

    const { readManagedServiceCatalog, readPublishedServiceCatalog, saveServiceCatalogDraft } = await import(
      `../lib/managed-service-catalog.ts?description-v2=${Date.now()}`
    );
    const managed = await readManagedServiceCatalog();
    const published = await readPublishedServiceCatalog();
    assert.equal(managed.draft.serviceCategoryDescriptions.length, 9);
    assert.equal(managed.draft.rangerIdentities[0].description, "合同、治理与经营风险的独立专业支持");
    assert.equal(published.serviceCategoryDescriptions[3].description, "合同文件、交易规则与经营合规检查");
    assert.equal(managed.publicationHistory.length, 1);

    await saveServiceCatalogDraft(managed.draft, managed.revision);
    const persisted = JSON.parse(await readFile(path.join(root, "opc-service-catalog.json"), "utf8"));
    assert.equal(persisted.schemaVersion, 2);
    assert.equal(persisted.draft.serviceCategoryDescriptions.length, 9);
    assert.ok(persisted.draft.rangerIdentities.every((identity: Record<string, unknown>) => identity.description));
    assert.equal(persisted.publications[0].catalog.serviceCategoryDescriptions.length, 9);
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    if (previousSeedPath === undefined) delete process.env.VAULT2077_OPC_SEED_PATH;
    else process.env.VAULT2077_OPC_SEED_PATH = previousSeedPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("OPC ranger signatures remain optional and normalize to one short statement", async () => {
  const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
  const { normalizeOpcCatalog, validateOpcCatalog } = await import("../lib/managed-service-catalog.ts");
  const catalog = createDefaultOpcCatalog();
  catalog.rangers.push(rangerFixture({
    signature: `  ${"签".repeat(RANGER_SIGNATURE_MAX_LENGTH + 10)}  `,
  }));

  const normalized = normalizeOpcCatalog(catalog);
  assert.equal(
    normalized.rangers[0].signature,
    "签".repeat(RANGER_SIGNATURE_MAX_LENGTH),
  );
  assert.equal(validateOpcCatalog(normalized, true).valid, true);

  catalog.rangers[0].signature = "   ";
  assert.equal(normalizeOpcCatalog(catalog).rangers[0].signature, undefined);
});

test("OPC ranger avatars preserve syntactically safe legacy reads and reject unsafe sources", async () => {
  const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
  const { normalizeOpcCatalog, validateOpcCatalog } = await import("../lib/managed-service-catalog.ts");
  const catalog = createDefaultOpcCatalog();
  catalog.rangers.push(rangerFixture({ avatarUrl: "data:image/png;base64,AAAA" }));

  const normalized = normalizeOpcCatalog(catalog);
  assert.equal(normalized.rangers[0].avatarUrl, "data:image/png;base64,AAAA");
  assert.equal(validateOpcCatalog(normalized).valid, true);

  for (const avatarUrl of [
    "https://images.example.com/avatar.png",
    "http://images.example.com/avatar.png",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "javascript:alert(1)",
  ]) {
    const unsafeCatalog = createDefaultOpcCatalog();
    unsafeCatalog.rangers.push(rangerFixture({ avatarUrl }));
    const result = validateOpcCatalog(normalizeOpcCatalog(unsafeCatalog));
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("外部图片必须重新上传")));
  }
});

test("OPC ranger avatars preserve valid managed media references", async () => {
  const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
  const { normalizeOpcCatalog, validateOpcCatalog } = await import("../lib/managed-service-catalog.ts");
  const catalog = createDefaultOpcCatalog();
  const sha256 = "a".repeat(64);
  catalog.rangers.push(rangerFixture({
    avatar: {
      schemaVersion: 1,
      smallKey: `rangers/verified-legal-advisor/${sha256}/avatar-320.webp`,
      largeKey: `rangers/verified-legal-advisor/${sha256}/avatar-800.webp`,
      sha256,
      width: 800,
      height: 800,
      updatedAt: "2026-07-31T00:00:00.000Z",
    },
  }));
  const normalized = normalizeOpcCatalog(catalog);
  assert.equal(normalized.rangers[0].avatar?.sha256, sha256);
  assert.equal(validateOpcCatalog(normalized).valid, true);

  normalized.rangers[0].slug = "renamed-advisor";
  const mismatched = validateOpcCatalog(normalized);
  assert.equal(mismatched.valid, false);
  assert.ok(mismatched.errors.some((error) => error.includes("必须属于当前游骑兵 slug")));
});
