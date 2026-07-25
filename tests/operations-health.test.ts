import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("operations health reports business degradation without leaking credentials", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-health-"));
  const previous = { ...process.env };
  Object.assign(process.env, {
    VAULT2077_DATA_DIR: root,
    VAULT2077_PIPELINE_SHARED_SECRET: "vault2077-health-test-shared-secret-value",
    VAULT2077_VAULT_LLM_BASE_URL: "https://vault-model.example/v1",
    VAULT2077_VAULT_LLM_API_KEY: "vault-secret-key",
    VAULT2077_VAULT_LLM_MODEL: "vault-model",
    VAULT2077_SIC_LLM_BASE_URL: "https://sic-model.example/v1",
    VAULT2077_SIC_LLM_API_KEY: "sic-secret-key",
    VAULT2077_SIC_LLM_MODEL: "sic-model",
  });
  try {
    const { getOperationsHealth } = await import(`../lib/operations-health.ts?health=${Date.now()}`);
    const health = await getOperationsHealth();
    assert.equal(health.status, "degraded");
    assert.equal(health.checks.database.status, "ok");
    assert.equal(health.checks.vaultFreshness.status, "degraded");
    assert.equal(health.checks.vaultEditorial.status, "ok");
    const serialized = JSON.stringify(health);
    assert.doesNotMatch(serialized, /vault-secret-key|sic-secret-key/);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
    await rm(root, { recursive: true, force: true });
  }
});
