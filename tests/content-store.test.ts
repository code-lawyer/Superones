import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getStoredContent, mergeContentSourceReport, replaceStoredContent } from "../lib/content-store.ts";
import type { EventRecord, InformationItem } from "../lib/types.ts";

function information(
  slug: string,
  collectedAt: string,
  sourceChannelId = "source-a",
  contentGroup: "information" | "roadside" = "information",
): InformationItem {
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
    contentGroup,
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
      contentGroup: "information",
      runMode: "bootstrap",
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
      contentGroup: "information",
      runMode: "bootstrap",
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
      contentGroup: "information",
      runMode: "bootstrap",
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
      contentGroup: "information",
      runMode: "bootstrap",
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
      contentGroup: "information",
      runMode: "bootstrap",
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

test("information incremental snapshots retain the rolling 30-day waterfall", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-information-window-"));
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

  await replaceStoredContent({
    events: [],
    information: [],
    projects: [],
    sourceCount: 2,
    snapshot: {
      contentGroup: "information",
      runMode: "bootstrap",
      runId: "run:bootstrap",
      collectedAt: "2026-08-01T08:00:00.000Z",
      sources: [
        { sourceId: "source-a", items: [information("retained", "2026-07-20T08:00:00.000Z")] },
        { sourceId: "source-b", items: [information("expired", "2026-06-30T08:00:00.000Z", "source-b")] },
      ],
      reports: [
        { sourceId: "source-a", status: "succeeded", collectedAt: "2026-08-01T08:00:00.000Z" },
        { sourceId: "source-b", status: "succeeded", collectedAt: "2026-08-01T08:00:00.000Z" },
      ],
      activeSourceIds: ["source-a", "source-b"],
    },
  });
  await replaceStoredContent({
    events: [],
    information: [],
    projects: [],
    sourceCount: 2,
    snapshot: {
      contentGroup: "information",
      runMode: "incremental",
      runId: "run:incremental",
      collectedAt: "2026-08-02T08:00:00.000Z",
      sources: [
        { sourceId: "source-a", items: [information("new", "2026-08-02T08:00:00.000Z")] },
        { sourceId: "source-b", items: [] },
      ],
      reports: [
        { sourceId: "source-a", status: "succeeded", collectedAt: "2026-08-02T08:00:00.000Z" },
        { sourceId: "source-b", status: "empty", collectedAt: "2026-08-02T08:00:00.000Z" },
      ],
      activeSourceIds: ["source-a", "source-b"],
    },
  });

  const stored = await getStoredContent();
  assert.deepEqual(stored.information.map((item) => item.slug), ["new", "retained"]);
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

test("information and roadside snapshots replace only their own lane", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-content-lanes-"));
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

  await replaceStoredContent({
    events: [],
    information: [],
    projects: [],
    sourceCount: 1,
    snapshot: {
      contentGroup: "information",
      runMode: "bootstrap",
      runId: "run:information",
      collectedAt: "2026-08-02T08:00:00.000Z",
      sources: [{
        sourceId: "information-source",
        items: [information("information-item", "2026-08-02T08:00:00.000Z", "information-source")],
      }],
      reports: [{ sourceId: "information-source", status: "succeeded", collectedAt: "2026-08-02T08:00:00.000Z" }],
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
      runId: "run:roadside",
      collectedAt: "2026-08-02T08:05:00.000Z",
      sources: [{
        sourceId: "roadside-source",
        items: [information("roadside-item", "2026-08-02T08:05:00.000Z", "roadside-source", "roadside")],
      }],
      reports: [{ sourceId: "roadside-source", status: "succeeded", collectedAt: "2026-08-02T08:05:00.000Z" }],
      activeSourceIds: ["roadside-source"],
    },
  });

  const stored = await getStoredContent();
  assert.deepEqual(
    stored.information.map((item) => item.slug).sort(),
    ["information-item", "roadside-item"],
  );

  const target = path.join(root, "content-store.json");
  const legacy = JSON.parse(await readFile(target, "utf8")) as {
    sourceSnapshots: Record<string, { contentGroup?: string }>;
    sourceReports: Record<string, { contentGroup?: string }>;
  };
  for (const snapshot of Object.values(legacy.sourceSnapshots)) delete snapshot.contentGroup;
  for (const report of Object.values(legacy.sourceReports)) delete report.contentGroup;
  await writeFile(target, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");

  await replaceStoredContent({
    events: [],
    information: [],
    projects: [],
    sourceCount: 0,
    snapshot: {
      contentGroup: "information",
      runMode: "bootstrap",
      runId: "run:retire-information",
      collectedAt: "2026-08-02T08:10:00.000Z",
      sources: [],
      reports: [],
      activeSourceIds: [],
    },
  });

  const migrated = await getStoredContent();
  assert.deepEqual(migrated.information.map((item) => item.slug), ["roadside-item"]);
  assert.deepEqual(Object.keys(migrated.sourceSnapshots), ["roadside-source"]);
  assert.deepEqual(Object.keys(migrated.sourceReports), ["roadside-source"]);
  assert.equal(migrated.sourceSnapshots["roadside-source"].contentGroup, "roadside");
  assert.equal(migrated.sourceReports["roadside-source"].contentGroup, "roadside");
});
