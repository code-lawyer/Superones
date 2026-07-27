import assert from "node:assert/strict";
import test from "node:test";
import {
  allOpcServices,
  infrastructureServices,
  rangerIdentities,
  specialtyDomains,
  specialtyServices,
  rangerProfiles,
} from "../lib/opc-catalog.ts";

test("OPC catalog initializes the seven first-version infrastructure SKUs", () => {
  assert.deepEqual(infrastructureServices.map((service) => service.name), [
    "经营主体启动与首年治理",
    "财税与经营资金运行",
    "合同、交易与回款运行",
    "线上经营与平台准入",
    "用工与外部协作运行",
    "知识产权与数字资产运行",
    "数据、隐私与信息安全运行",
  ]);
  assert.equal(new Set(infrastructureServices.map((service) => service.slug)).size, 7);
  assert.deepEqual(
    infrastructureServices.reduce<Record<string, number>>((groups, service) => {
      groups[service.group] = (groups[service.group] ?? 0) + 1;
      return groups;
    }, {}),
    {
      "启动经营": 2,
      "上线与交付": 2,
      "持续安全运行": 3,
    },
  );
});

test("OPC first-version specialty catalog contains fourteen SKUs across six domains", () => {
  assert.equal(specialtyDomains.length, 6);
  assert.equal(specialtyServices.length, 14);
  assert.deepEqual(
    specialtyServices.reduce<Record<string, number>>((domains, service) => {
      domains[service.domain] = (domains[service.domain] ?? 0) + 1;
      return domains;
    }, {}),
    {
      "法律与经营风险": 3,
      "财税与现金流": 3,
      "品牌与线上获客": 2,
      "AI与企业数字化": 2,
      "用工与协作者": 1,
      "知识产权与产品商业化": 3,
    },
  );
});

test("Every first-version OPC SKU is page-ready and uses an explicit RMB price", () => {
  assert.equal(allOpcServices.length, 21);
  assert.equal(new Set(allOpcServices.map((service) => service.slug)).size, 21);
  for (const service of allOpcServices) {
    assert.match(service.price, /^人民币 [\d,]+ 元(?:\/年)?$/);
    assert.ok(service.outcome.trim());
    assert.ok(service.audience.trim());
    assert.ok(service.includes.length > 0);
    assert.ok(service.deliverables.length > 0);
    assert.ok(service.materials.length > 0);
    assert.ok((service.deliveryRoles?.length ?? 0) > 0);
    assert.ok((service.acceptance?.length ?? 0) > 0);
    assert.ok(service.boundary.trim());
    assert.ok(service.feeNote?.trim());
    assert.ok(service.period.trim());
  }
});

test("OPC specialty and ranger taxonomies remain separate", () => {
  assert.equal(rangerIdentities.length, 10);
  assert.ok(rangerIdentities.every((identity) => !specialtyDomains.includes(identity as never)));
});

test("Every listed ranger has an authorized public email", () => {
  for (const ranger of rangerProfiles) {
    assert.match(ranger.contactLabel, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    assert.equal(ranger.contactState, "EMAIL / PUBLIC");
    assert.equal(ranger.authorizationStatus, "本人已授权公开");
    assert.match(ranger.verificationDate ?? "", /^\d{4}-\d{2}-\d{2}$/);
    assert.match(ranger.profileUpdatedAt ?? "", /^\d{4}-\d{2}-\d{2}$/);
  }
});
