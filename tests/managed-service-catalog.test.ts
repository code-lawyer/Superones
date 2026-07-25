import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { OpcService, RangerProfile } from "../lib/opc-catalog.ts";

test("OPC service catalog keeps drafts private until an atomic validated publish", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-opc-catalog-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
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

    assert.equal((await readPublishedServiceCatalog()).infrastructure[0].name, "主体设立与基础合规");
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
    await assert.rejects(
      saveServiceCatalogDraft(publishable, saved.revision),
      ServiceCatalogConflictError,
    );
    assert.equal((await readManagedServiceCatalog()).revision, published.revision);
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
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
