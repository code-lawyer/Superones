import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { InformationItem } from "../lib/types.ts";

function information(slug: string, collectedAt: string, contentGroup: "information" | "roadside"): InformationItem {
  return {
    slug,
    translatedTitle: slug,
    originalTitle: slug,
    summary: slug,
    translatedContent: slug,
    originalContent: slug,
    originalLanguage: "en",
    sourceName: `${contentGroup}-source`,
    sourceRole: "官方",
    sourceUrl: `https://example.com/${slug}`,
    author: "author",
    publishedAt: collectedAt,
    discoveredAt: collectedAt,
    eventSlugs: [],
    originalDisplay: "full",
    sourceChannelId: `${contentGroup}-source`,
    contentGroup,
  };
}

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
    const now = new Date().toISOString();
    const staleInformationAt = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
    const { replaceStoredContent } = await import(`../lib/content-store.ts?health-store=${Date.now()}`);
    await replaceStoredContent({
      events: [],
      information: [],
      projects: [],
      sourceCount: 1,
      snapshot: {
        contentGroup: "information",
        runMode: "bootstrap",
        runId: "health:information",
        collectedAt: staleInformationAt,
        sources: [{ sourceId: "information-source", items: [information("only-story", staleInformationAt, "information")] }],
        reports: [{ sourceId: "information-source", status: "succeeded", collectedAt: staleInformationAt }],
        activeSourceIds: ["information-source"],
      },
    });
    await replaceStoredContent({
      events: [],
      information: [],
      projects: [],
      sourceCount: 1,
      snapshot: {
        contentGroup: "roadside",
        runMode: "bootstrap",
        runId: "health:roadside",
        collectedAt: now,
        sources: [{ sourceId: "roadside-source", items: [information("fresh-roadside", now, "roadside")] }],
        reports: [{ sourceId: "roadside-source", status: "succeeded", collectedAt: now }],
        activeSourceIds: ["roadside-source"],
      },
    });
    const { getOperationsHealth } = await import(`../lib/operations-health.ts?health=${Date.now()}`);
    const health = await getOperationsHealth();
    assert.equal(health.status, "degraded");
    assert.equal(health.checks.database.status, "ok");
    assert.equal(health.checks.vaultFreshness.status, "ok");
    assert.equal(health.checks.informationFlow.status, "degraded");
    assert.match(health.checks.informationFlow.detail, /count=1/);
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
