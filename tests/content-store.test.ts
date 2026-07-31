import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getStoredContent, mergeContentSourceReport, replaceStoredContent } from "../lib/content-store.ts";
import type { EventRecord, InformationItem } from "../lib/types.ts";

function information(slug: string, collectedAt: string, sourceChannelId = "source-a"): InformationItem {
  return {
    slug,
    translatedTitle: slug,
    originalTitle: slug,
    summary: slug,
    translatedContent: slug,
    originalContent: slug,
    originalLanguage: "en",
    sourceName: "Source A",
    sourceRole: "test" as InformationItem["sourceRole"],
    sourceUrl: `https://example.com/${slug}`,
    author: "author",
    publishedAt: collectedAt,
    discoveredAt: collectedAt,
    eventSlugs: [],
    originalDisplay: "full",
    contentHash: slug.padEnd(64, "0").slice(0, 64),
    sourceChannelId,
  };
}

function event(summary: string, updated: string): EventRecord {
  return {
    slug: "durable-event",
    record: "VLT/EVT/TEST",
    category: "test" as EventRecord["category"],
    title: "Durable event",
    summary,
    significance: summary,
    entities: [],
    firstSeen: "2026-07-30T00:00:00.000Z",
    updated,
  };
}

test("current snapshots replace source content, reject older writes, and retain the event ledger", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-content-store-"));
  const previousDataDirectory = process.env.VAULT2077_DATA_DIR;
  const previousDatabaseUrl = process.env.VAULT2077_DATABASE_URL;
  const previousFallbackDatabaseUrl = process.env.DATABASE_URL;
  process.env.VAULT2077_DATA_DIR = root;
  delete process.env.VAULT2077_DATABASE_URL;
  delete process.env.DATABASE_URL;
  context.after(async () => {
    if (previousDataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDirectory;
    if (previousDatabaseUrl === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previousDatabaseUrl;
    if (previousFallbackDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousFallbackDatabaseUrl;
    await rm(root, { recursive: true, force: true });
  });

  const firstAt = "2026-07-30T08:00:00.000Z";
  const latestAt = "2026-07-31T08:00:00.000Z";
  await replaceStoredContent({
    events: [event("first", firstAt)],
    information: [],
    projects: [],
    sourceCount: 2,
    snapshot: {
      runId: "run:first",
      collectedAt: firstAt,
      sources: [
        { sourceId: "source-a", items: [information("old", firstAt)] },
        { sourceId: "source-retired", items: [information("retired", firstAt, "source-retired")] },
      ],
      reports: [
        { sourceId: "source-a", status: "succeeded", collectedAt: firstAt },
        { sourceId: "source-retired", status: "succeeded", collectedAt: firstAt },
      ],
      activeSourceIds: ["source-a", "source-retired"],
    },
  });
  await replaceStoredContent({
    events: [event("latest", latestAt)],
    information: [],
    projects: [],
    sourceCount: 1,
    snapshot: {
      runId: "run:latest",
      collectedAt: latestAt,
      sources: [{ sourceId: "source-a", items: [information("latest", latestAt)] }],
      reports: [{ sourceId: "source-a", status: "succeeded", collectedAt: latestAt }],
      activeSourceIds: ["source-a"],
    },
  });
  await replaceStoredContent({
    events: [event("stale overwrite", "2026-07-30T12:00:00.000Z")],
    information: [],
    projects: [],
    sourceCount: 1,
    snapshot: {
      runId: "run:stale",
      collectedAt: "2026-07-30T12:00:00.000Z",
      sources: [{ sourceId: "source-a", items: [information("stale", "2026-07-30T12:00:00.000Z")] }],
      reports: [{ sourceId: "source-a", status: "succeeded", collectedAt: "2026-07-30T12:00:00.000Z" }],
    },
  });

  let stored = await getStoredContent();
  assert.deepEqual(stored.information.map((item) => item.slug), ["latest"]);
  assert.deepEqual(Object.keys(stored.sourceSnapshots), ["source-a"]);
  assert.equal(stored.events[0].summary, "latest");

  await replaceStoredContent({
    events: [],
    information: [],
    projects: [],
    sourceCount: 1,
    snapshot: {
      runId: "run:failed",
      collectedAt: "2026-07-31T10:00:00.000Z",
      sources: [],
      reports: [{ sourceId: "source-a", status: "failed", collectedAt: "2026-07-31T10:00:00.000Z" }],
    },
  });
  stored = await getStoredContent();
  assert.deepEqual(stored.information.map((item) => item.slug), ["latest"]);
  assert.equal(stored.state.mode, "degraded");

  await replaceStoredContent({
    events: [],
    information: [],
    projects: [],
    sourceCount: 1,
    snapshot: {
      runId: "run:empty",
      collectedAt: "2026-07-31T12:00:00.000Z",
      sources: [{ sourceId: "source-a", items: [] }],
      reports: [{ sourceId: "source-a", status: "empty", collectedAt: "2026-07-31T12:00:00.000Z" }],
    },
  });
  stored = await getStoredContent();
  assert.equal(stored.information.length, 0);
  assert.equal(stored.events[0].summary, "latest");
  assert.equal(stored.state.mode, "live");
});

test("same-run source reports retain the worst shard status", () => {
  const collectedAt = "2026-07-31T08:00:00.000Z";
  const partial = mergeContentSourceReport({
    sourceId: "source-a",
    status: "partial",
    collectedAt,
    errorCode: "EDITORIAL_PARTIAL",
  }, {
    sourceId: "source-a",
    status: "succeeded",
    collectedAt,
  });
  assert.equal(partial.status, "partial");
  assert.equal(partial.errorCode, "EDITORIAL_PARTIAL");

  const mixed = mergeContentSourceReport({
    sourceId: "source-a",
    status: "failed",
    collectedAt,
  }, {
    sourceId: "source-a",
    status: "succeeded",
    collectedAt,
  });
  assert.equal(mixed.status, "partial");
});
