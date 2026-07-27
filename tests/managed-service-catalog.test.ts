import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { OpcService, RangerProfile } from "../lib/opc-catalog.ts";

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
    const draft = structuredClone(initial.draft);
    draft.infrastructure[0].name = "已修改但未发布的服务";
    draft.rangers[0].contactState = "PROFILE PREVIEW";
    const saved = await saveServiceCatalogDraft(draft, initial.revision);

    assert.equal((await readPublishedServiceCatalog()).infrastructure[0].name, "经营主体启动与首年治理");
    assert.equal((await readManagedServiceCatalog()).draft.infrastructure[0].name, "已修改但未发布的服务");
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
    assert.equal((await readPublishedServiceCatalog()).infrastructure[0].name, "已修改但未发布的服务");
    const seed = JSON.parse(await readFile(process.env.VAULT2077_OPC_SEED_PATH, "utf8"));
    assert.equal(seed.schemaVersion, 1);
    assert.equal(seed.sourceRevision, published.revision);
    assert.equal(seed.publishedAt, published.publishedAt);
    assert.equal(seed.catalog.infrastructure[0].name, "已修改但未发布的服务");
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

test("OPC service catalog rejects new uncontrolled taxonomies", async () => {
  const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
  const { normalizeOpcCatalog, validateOpcCatalog } = await import("../lib/managed-service-catalog.ts");
  const catalog = createDefaultOpcCatalog();
  catalog.specialties[0].domain = "随意新增的自动内容栏目";
  const result = validateOpcCatalog(normalizeOpcCatalog(catalog));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("专项服务领域无效")));
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
    assert.equal(published.rangers[0].contactLabel, "ranger.a01@vault2077.com");
    assert.equal(published.rangers[0].authorizationStatus, "本人已授权公开");
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    if (previousSeedPath === undefined) delete process.env.VAULT2077_OPC_SEED_PATH;
    else process.env.VAULT2077_OPC_SEED_PATH = previousSeedPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("OPC service catalog repairs stale public ranger previews without overwriting the draft", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-ranger-preview-repair-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  const previousSeedPath = process.env.VAULT2077_OPC_SEED_PATH;
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_OPC_SEED_PATH = path.join(root, "missing-seed.json");
  try {
    const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
    const staleDraft = createDefaultOpcCatalog();
    staleDraft.rangers[0].contactLabel = "联系方式将在本人确认后公开";
    staleDraft.rangers[0].contactState = "PROFILE PREVIEW";
    staleDraft.rangers[0].verificationDate = undefined;
    staleDraft.rangers[0].profileUpdatedAt = undefined;
    staleDraft.rangers[0].authorizationStatus = "本人授权待确认";
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
    assert.equal(managed.draft.rangers[0].contactState, "PROFILE PREVIEW");
    assert.equal(published.rangers[0].contactLabel, "ranger.a01@vault2077.com");
    assert.equal(published.rangers[0].contactState, "EMAIL / PUBLIC");
    assert.equal(published.rangers[0].authorizationStatus, "本人已授权公开");
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    if (previousSeedPath === undefined) delete process.env.VAULT2077_OPC_SEED_PATH;
    else process.env.VAULT2077_OPC_SEED_PATH = previousSeedPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("OPC service catalog migrates legacy published ranger contacts and history", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-ranger-published-migration-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  const previousSeedPath = process.env.VAULT2077_OPC_SEED_PATH;
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_OPC_SEED_PATH = path.join(root, "missing-seed.json");
  try {
    const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
    const legacy = createDefaultOpcCatalog();
    legacy.rangers[0].publicName = "运营改名后的专家";
    legacy.rangers[0].intro = "运营人员补充的公开简介。";
    legacy.rangers[0].credential = "运营人员补充的公开职业记录。";
    legacy.rangers[0].contactLabel = "公开联系入口 1";
    legacy.rangers[0].contactState = "本人已授权";
    legacy.rangers.push({
      ...structuredClone(legacy.rangers[1]),
      slug: "custom-advisor",
      publicName: "自定义专家",
      intro: "自定义专家公开简介。",
      contactLabel: "公开联系入口 11",
      contactState: "本人已授权",
    });
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
    assert.equal(managed.draft.rangers[0].contactLabel, "公开联系入口 1");
    assert.equal(published.rangers[0].contactLabel, "ranger.a01@vault2077.com");
    assert.equal(published.rangers[0].contactState, "EMAIL / PUBLIC");
    assert.equal(published.rangers[0].publicName, "运营改名后的专家");
    assert.equal(published.rangers[0].intro, "运营人员补充的公开简介。");
    assert.equal(published.rangers[0].credential, "运营人员补充的公开职业记录。");
    assert.equal(published.rangers[10].slug, "custom-advisor");
    assert.equal(published.rangers[10].contactLabel, "ranger.custom-advisor@vault2077.com");
    assert.equal(managed.publicationHistory.length, 1);
    assert.equal(managed.publicationHistory[0].revision, 3);
    assert.equal(managed.publicationHistory[0].rangers, 11);
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
    unsafeCatalog.rangers[0].contactLabel = contactLabel;
    const unsafeResult = validateOpcCatalog(normalizeOpcCatalog(unsafeCatalog), true);
    assert.equal(unsafeResult.valid, false);
    assert.ok(unsafeResult.errors.some((error) => error.includes("联系方式必须是公开邮箱")));
  }
});
