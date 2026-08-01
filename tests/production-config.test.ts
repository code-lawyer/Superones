import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionConfiguration } from "../lib/production-config.ts";
import { validTestAlipayEnvironment } from "./alipay-test-environment.ts";

function validEnvironment() {
  const secret = "s".repeat(40);
  return {
    NODE_ENV: "production",
    VAULT2077_DATABASE_URL: "postgresql://vault2077:secure@db.internal/vault2077",
    VAULT2077_DATABASE_SSL: "require",
    VAULT2077_ICP_NUMBER: "沪ICP备2026003401号-1",
    VAULT2077_OPERATOR_CREDIT_CODE: "91310000MAC3G0M33G",
    VAULT2077_OPERATOR_REGISTERED_ADDRESS: "中国（上海）自由贸易试验区临港新片区环湖西二路888号C楼",
    VAULT2077_OPERATOR_LEGAL_REPRESENTATIVE: "胡丛蕊",
    VAULT2077_OPERATOR_REGISTERED_CAPITAL: "50万元人民币",
    VAULT2077_LEGAL_CONTACT_EMAIL: "lanzhouda@tsinglaw.com",
    VAULT2077_LEGAL_EFFECTIVE_DATE: "2026-08-01",
    VAULT2077_FRONTIER_WRITES_ENABLED: "true",
    VAULT2077_OPC_PAYMENTS_ENABLED: "true",
    VAULT2077_DATA_KEYS: JSON.stringify({ current: secret }),
    VAULT2077_DATA_ACTIVE_KEY_ID: "current",
    VAULT2077_ADMIN_SESSION_SECRET: `${secret}1`,
    VAULT2077_AUDIT_HASH_SECRET: `${secret}2`,
    ...validTestAlipayEnvironment(),
    VAULT2077_PUBLIC_ORIGIN: "https://superones.top",
    VAULT2077_ADMIN_ORIGIN: "https://admin.superones.top",
    VAULT2077_RANGER_MEDIA_STORAGE: "oss",
    VAULT2077_OSS_REGION: "oss-cn-shanghai",
    VAULT2077_OSS_BUCKET: "vault2077-public-media",
    VAULT2077_OSS_ACCESS_KEY_ID: "LTAI5tProductionMediaKey",
    VAULT2077_OSS_ACCESS_KEY_SECRET: "production-media-secret-key",
    VAULT2077_OSS_PUBLIC_ORIGIN: "https://media.superones.top",
    VAULT2077_OSS_INTERNAL: "true",
    VAULT2077_PIPELINE_SIGNING_KEYS: JSON.stringify({ current: `${secret}3` }),
    VAULT2077_PIPELINE_ACTIVE_KEY_ID: "current",
    VAULT2077_PIPELINE_WORKER_SECRET: `${secret}4`,
    VAULT2077_FRONTIER_TASKS_SECRET: `${secret}7`,
    VAULT2077_FRONTIER_TICK_SECRET: `${secret}5`,
    VAULT2077_HEALTH_SECRET: `${secret}6`,
    GITHUB_TOKEN: "github_pat_read_only_1234567890",
    VAULT2077_VAULT_LLM_BASE_URL: "https://vault-model.example/v1",
    VAULT2077_VAULT_LLM_API_KEY: "vault-api-key",
    VAULT2077_VAULT_LLM_MODEL: "vault-model",
    VAULT2077_SIC_LLM_BASE_URL: "https://sic-model.example/v1",
    VAULT2077_SIC_LLM_API_KEY: "sic-api-key",
    VAULT2077_SIC_LLM_MODEL: "sic-model",
    VAULT2077_TRUST_PROXY_HEADERS: "true",
  };
}

test("production configuration gate accepts an isolated complete configuration", () => {
  const report = validateProductionConfiguration(validEnvironment());
  assert.equal(report.ok, true, report.errors.join("\n"));
  assert.deepEqual(report.errors, []);
  assert.equal(report.summary.databaseHost, "db.internal");
});

test("production configuration gate rejects preview persistence and shared legacy models", () => {
  const report = validateProductionConfiguration({
    ...validEnvironment(),
    VAULT2077_ALLOW_FILE_PREVIEW: "true",
    VAULT2077_LLM_MODEL: "legacy-model",
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("ALLOW_FILE_PREVIEW")));
  assert.ok(report.errors.some((issue) => issue.includes("VAULT2077_LLM_MODEL")));
});

test("production configuration gate rejects invalid OPC Alipay Open Platform credentials", () => {
  const report = validateProductionConfiguration({
    ...validEnvironment(),
    VAULT2077_ALIPAY_GATEWAY: "https://third-party.test/gateway.do",
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("支付宝网关")));
});

test("production configuration gate requires isolated OSS ranger media storage", () => {
  const report = validateProductionConfiguration({
    ...validEnvironment(),
    VAULT2077_RANGER_MEDIA_STORAGE: "local",
    VAULT2077_OSS_PUBLIC_ORIGIN: "https://superones.top",
    VAULT2077_OSS_ACCESS_KEY_SECRET: "change-me",
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("RANGER_MEDIA_STORAGE")));
  assert.ok(report.errors.some((issue) => issue.includes("独立媒体域名")));
  assert.ok(report.errors.some((issue) => issue.includes("OSS_ACCESS_KEY_SECRET")));

  const wrongMediaDomain = validateProductionConfiguration({
    ...validEnvironment(),
    VAULT2077_OSS_PUBLIC_ORIGIN: "https://media-alt.superones.top",
  });
  assert.equal(wrongMediaDomain.ok, false);
  assert.ok(wrongMediaDomain.errors.some((issue) => issue.includes("已确认媒体域名")));
});

test("production configuration gate requires explicit feature switches and an ICP filing", () => {
  const report = validateProductionConfiguration({
    ...validEnvironment(),
    VAULT2077_FRONTIER_WRITES_ENABLED: "",
    VAULT2077_OPC_PAYMENTS_ENABLED: "",
    VAULT2077_ICP_NUMBER: "",
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("FRONTIER_WRITES_ENABLED")));
  assert.ok(report.errors.some((issue) => issue.includes("OPC_PAYMENTS_ENABLED")));
  assert.ok(report.errors.some((issue) => issue.includes("ICP")));
});

test("production configuration gate requires public business identity and legal contacts", () => {
  const report = validateProductionConfiguration({
    ...validEnvironment(),
    VAULT2077_OPERATOR_CREDIT_CODE: "",
    VAULT2077_OPERATOR_REGISTERED_ADDRESS: "",
    VAULT2077_OPERATOR_LEGAL_REPRESENTATIVE: "",
    VAULT2077_OPERATOR_REGISTERED_CAPITAL: "",
    VAULT2077_LEGAL_CONTACT_EMAIL: "",
    VAULT2077_LEGAL_EFFECTIVE_DATE: "",
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("CREDIT_CODE")));
  assert.ok(report.errors.some((issue) => issue.includes("REGISTERED_ADDRESS")));
  assert.ok(report.errors.some((issue) => issue.includes("LEGAL_REPRESENTATIVE")));
  assert.ok(report.errors.some((issue) => issue.includes("REGISTERED_CAPITAL")));
  assert.ok(report.errors.some((issue) => issue.includes("LEGAL_CONTACT_EMAIL")));
  assert.ok(report.errors.some((issue) => issue.includes("LEGAL_EFFECTIVE_DATE")));
});

test("production configuration gate allows OPC payments to remain safely closed", () => {
  const environment = {
    ...validEnvironment(),
    VAULT2077_OPC_PAYMENTS_ENABLED: "false",
    VAULT2077_ALIPAY_APP_ID: "",
    VAULT2077_ALIPAY_SELLER_ID: "",
    VAULT2077_ALIPAY_PRIVATE_KEY: "",
    VAULT2077_ALIPAY_PUBLIC_KEY: "",
    VAULT2077_ALIPAY_GATEWAY: "",
  };
  const report = validateProductionConfiguration(environment);
  assert.equal(report.ok, true, report.errors.join("\n"));
});

test("production configuration gate rejects the official Alipay sandbox gateway", () => {
  const report = validateProductionConfiguration({
    ...validEnvironment(),
    VAULT2077_ALIPAY_GATEWAY: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("正式网关")));
});

test("production configuration gate warns when both editorial channels share a provider", () => {
  const environment = validEnvironment();
  environment.VAULT2077_SIC_LLM_BASE_URL = environment.VAULT2077_VAULT_LLM_BASE_URL;
  const report = validateProductionConfiguration(environment);
  assert.equal(report.ok, true);
  assert.ok(report.warnings.some((issue) => issue.includes("故障隔离")));
});

test("production configuration gate rejects shared host and local password adapters", () => {
  const report = validateProductionConfiguration({
    ...validEnvironment(),
    VAULT2077_ADMIN_ORIGIN: "https://superones.top",
    VAULT2077_ADMIN_PASSWORD_HASH: "development-only",
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("独立主机")));
  assert.ok(report.errors.some((issue) => issue.includes("ADMIN_PASSWORD_HASH")));
});

test("production configuration gate rejects retired OIDC configuration", () => {
  const report = validateProductionConfiguration({
    ...validEnvironment(),
    VAULT2077_ADMIN_OIDC_ISSUER: "http://identity.vault2077.test/oidc",
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("已退役") && issue.includes("OIDC_ISSUER")));
});

test("production configuration gate rejects legacy single-value keys and untrusted proxy headers", () => {
  const report = validateProductionConfiguration({
    ...validEnvironment(),
    VAULT2077_DATA_KEY: "legacy-data-key-that-is-long-enough",
    VAULT2077_PIPELINE_SHARED_SECRET: "legacy-pipeline-key-that-is-long-enough",
    VAULT2077_TRUST_PROXY_HEADERS: "false",
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("VAULT2077_DATA_KEY")));
  assert.ok(report.errors.some((issue) => issue.includes("VAULT2077_PIPELINE_SHARED_SECRET")));
  assert.ok(report.errors.some((issue) => issue.includes("Nginx")));
});

test("production configuration gate rejects secret reuse across trust boundaries", () => {
  const environment = validEnvironment();
  environment.VAULT2077_FRONTIER_TASKS_SECRET = environment.VAULT2077_PIPELINE_WORKER_SECRET;
  const report = validateProductionConfiguration(environment);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("VAULT2077_FRONTIER_TASKS_SECRET")));
  assert.ok(report.errors.some((issue) => issue.includes("VAULT2077_PIPELINE_WORKER_SECRET")));
});
