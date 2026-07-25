import assert from "node:assert/strict";
import test from "node:test";
import {
  infrastructureServices,
  rangerIdentities,
  specialtyDomains,
} from "../lib/opc-catalog.ts";

test("OPC catalog uses the ten frozen infrastructure capability names", () => {
  assert.deepEqual(infrastructureServices.map((service) => service.name), [
    "主体设立与基础合规",
    "合同与交易基础",
    "财税核算基础",
    "用工与协作基础",
    "知识产权基础",
    "数据与隐私基础",
    "品牌与内容资产基础",
    "产品交付基础",
    "软件与自动化基础",
    "AI 应用治理基础",
  ]);
  assert.equal(new Set(infrastructureServices.map((service) => service.slug)).size, 10);
});

test("OPC specialty and ranger taxonomies remain separate", () => {
  assert.equal(specialtyDomains.length, 5);
  assert.equal(rangerIdentities.length, 10);
  assert.ok(rangerIdentities.every((identity) => !specialtyDomains.includes(identity as never)));
});
