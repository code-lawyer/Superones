import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionConfiguration } from "../lib/production-config.ts";

function validEnvironment() {
  const secret = "s".repeat(40);
  return {
    NODE_ENV: "production",
    VAULT2077_DATABASE_URL: "postgresql://vault2077:secure@db.internal/vault2077",
    VAULT2077_DATABASE_SSL: "require",
    VAULT2077_DATA_KEYS: JSON.stringify({ current: secret }),
    VAULT2077_DATA_ACTIVE_KEY_ID: "current",
    VAULT2077_ADMIN_SESSION_SECRET: `${secret}1`,
    VAULT2077_AUDIT_HASH_SECRET: `${secret}2`,
    VAULT2077_PUBLIC_ORIGIN: "https://vault2077.test",
    VAULT2077_OPC_ALIPAY_QR_PATH: "/opc/alipay-payment-qr.png",
    VAULT2077_OPC_ALIPAY_PAYEE: "Vault2077 运营主体",
    VAULT2077_ADMIN_ORIGIN: "https://admin.vault2077.test",
    VAULT2077_ADMIN_IDENTITY_ISSUER: "https://identity.vault2077.test",
    VAULT2077_ADMIN_IDENTITY_AUDIENCE: "vault2077-production-admin",
    VAULT2077_ADMIN_IDENTITY_JWKS_URL: "https://identity.vault2077.test/.well-known/jwks.json",
    VAULT2077_ADMIN_IDENTITY_HEADER: "cf-access-jwt-assertion",
    VAULT2077_ADMIN_IDENTITY_ALLOWLIST: "owner@vault2077.test",
    VAULT2077_ADMIN_REAUTH_URL: "https://admin.vault2077.test/cdn-cgi/access/logout",
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

test("production configuration gate rejects incomplete OPC Alipay collection details", () => {
  const report = validateProductionConfiguration({
    ...validEnvironment(),
    VAULT2077_OPC_ALIPAY_QR_PATH: "https://third-party.test/qr.svg",
    VAULT2077_OPC_ALIPAY_PAYEE: "example payee",
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("OPC_ALIPAY_QR_PATH")));
  assert.ok(report.errors.some((issue) => issue.includes("OPC_ALIPAY_PAYEE")));
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
    VAULT2077_ADMIN_ORIGIN: "https://vault2077.test",
    VAULT2077_ADMIN_PASSWORD_HASH: "development-only",
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("独立主机")));
  assert.ok(report.errors.some((issue) => issue.includes("ADMIN_PASSWORD_HASH")));
});

test("production configuration gate rejects an invalid identity gateway contract", () => {
  const report = validateProductionConfiguration({
    ...validEnvironment(),
    VAULT2077_ADMIN_IDENTITY_JWKS_URL: "http://identity.vault2077.test/jwks",
    VAULT2077_ADMIN_IDENTITY_ALLOWLIST: "not-an-email",
    VAULT2077_ADMIN_REAUTH_URL: "https://other.vault2077.test/reauthenticate",
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((issue) => issue.includes("JWKS_URL")));
  assert.ok(report.errors.some((issue) => issue.includes("ALLOWLIST")));
  assert.ok(report.errors.some((issue) => issue.includes("REAUTH_URL")));
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
