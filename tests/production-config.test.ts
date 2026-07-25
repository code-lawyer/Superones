import assert from "node:assert/strict";
import test from "node:test";
import { validateProductionConfiguration } from "../lib/production-config.ts";

function validEnvironment() {
  const secret = "s".repeat(40);
  return {
    NODE_ENV: "production",
    VAULT2077_DATABASE_URL: "postgresql://vault2077:secure@db.internal/vault2077",
    VAULT2077_DATABASE_SSL: "require",
    VAULT2077_DATA_KEY: secret,
    VAULT2077_ADMIN_PASSWORD_HASH: "argon2id$v=1$m=65536,t=3,p=1$MTIzNDU2Nzg5MGFiY2RlZg$MTIzNDU2Nzg5MGFiY2RlZjEyMzQ1Njc4OTBhYmNkZWY",
    VAULT2077_ADMIN_SESSION_SECRET: `${secret}1`,
    VAULT2077_AUDIT_HASH_SECRET: `${secret}2`,
    VAULT2077_PIPELINE_SHARED_SECRET: `${secret}3`,
    VAULT2077_PIPELINE_WORKER_SECRET: `${secret}4`,
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

test("production configuration gate warns when both editorial channels share a provider", () => {
  const environment = validEnvironment();
  environment.VAULT2077_SIC_LLM_BASE_URL = environment.VAULT2077_VAULT_LLM_BASE_URL;
  const report = validateProductionConfiguration(environment);
  assert.equal(report.ok, true);
  assert.ok(report.warnings.some((issue) => issue.includes("故障隔离")));
});
