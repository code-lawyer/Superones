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
      status: "已完成专业复核",
      effectiveAt: "2099-01-01",
      reviewNote: "由对应专业负责人完成复核。",
    }));
    publishable.specialties = publishable.specialties.map((service: OpcService) => ({
      ...service,
      price: "人民币 500 元",
      period: "3 个工作日",
      status: "已完成专业复核",
      effectiveAt: "2099-01-01",
      reviewNote: "由对应专业负责人完成复核。",
    }));
    publishable.rangers = publishable.rangers.map((ranger: RangerProfile, index: number) => ({
      ...ranger,
      contactLabel: `公开联系入口 ${index + 1}`,
      contactState: "本人已授权",
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
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    if (previousSeedPath === undefined) delete process.env.VAULT2077_OPC_SEED_PATH;
    else process.env.VAULT2077_OPC_SEED_PATH = previousSeedPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("OPC publication requires valid public dates and ranger contact state", async () => {
  const { createDefaultOpcCatalog } = await import("../lib/opc-catalog.ts");
  const { normalizeOpcCatalog, validateOpcCatalog } = await import("../lib/managed-service-catalog.ts");
  const catalog = createDefaultOpcCatalog();
  catalog.infrastructure[0].effectiveAt = "2099-02-30";
  catalog.rangers[0].contactState = "";
  catalog.rangers[0].verificationDate = "tomorrow";
  catalog.rangers[0].profileUpdatedAt = "2099-13-01";
  const result = validateOpcCatalog(normalizeOpcCatalog(catalog), true);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("生效时间必须使用 YYYY-MM-DD")));
  assert.ok(result.errors.some((error) => error.includes("联系状态不能为空")));
  assert.ok(result.errors.some((error) => error.includes("核验日期必须使用 YYYY-MM-DD")));
  assert.ok(result.errors.some((error) => error.includes("资料更新时间必须使用 YYYY-MM-DD")));
});
