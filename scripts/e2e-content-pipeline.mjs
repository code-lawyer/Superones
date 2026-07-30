import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";

const origin = (process.env.VAULT2077_E2E_ORIGIN ?? "http://127.0.0.1:3021").replace(/\/+$/, "");
const secret = process.env.VAULT2077_E2E_SECRET ?? "vault2077-e2e-shared-secret-32-bytes";
const now = new Date();
const iso = now.toISOString();
const batchId = `vault2077-e2e-${Date.now()}`;

function information(index, sourceRole, publisher, ownerEntity) {
  const originalTitle = `[event] Source ${index} reports the same material change`;
  const originalContent = `Original English source ${index}. This text must remain available after domestic translation.`;
  return {
    idempotencyKey: `${batchId}-item-${index}`,
    sourceChannelId: `e2e-source-${index}`,
    discoveryPath: `rss:https://example.com/feed-${index}.xml`,
    originalPublisher: publisher,
    ownerEntity,
    publisherKind: sourceRole === "官方" ? "organization" : "editorial_media",
    evidenceNature: sourceRole === "官方" ? "primary" : "reported_analysis",
    classificationConfidence: "high",
    sourceRole,
    originalUrl: `https://example.com/e2e/${batchId}/${index}`,
    originalPublishedAt: iso,
    fetchedAt: iso,
    originalLanguage: "en",
    originalTitle,
    originalContent,
    contentCompleteness: "fulltext",
    contentHash: createHash("sha256").update(`${originalTitle}\n${originalContent}`).digest("hex"),
  };
}

const informationItems = [
  information(1, "官方", "Example AI", "organization:example-ai"),
  information(2, "媒体", "Example Research", "media:example-research"),
  information(3, "媒体", "Example Review", "media:example-review"),
];
const packet = {
  schemaVersion: 1,
  batchId,
  runId: `run:${batchId}`,
  lane: "information",
  runMode: "incremental",
  scheduleId: `e2e:${batchId}`,
  windowFrom: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
  windowUntil: iso,
  registryRevision: "sources:e2e-source-bundle-v1",
  collectedFrom: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
  collectedUntil: iso,
  collectedAt: iso,
  records: informationItems.map((item) => ({
    schemaVersion: 1,
    kind: "information",
    recordId: `information:${createHash("sha256").update(item.idempotencyKey).digest("hex")}`,
    sourceId: item.sourceChannelId,
    externalId: item.idempotencyKey,
    canonicalUrl: item.originalUrl,
    observedAt: item.fetchedAt,
    contentHash: item.contentHash,
    payload: {
      discoveryPath: item.discoveryPath,
      originalPublisher: item.originalPublisher,
      ownerEntity: item.ownerEntity,
      publisherKind: item.publisherKind,
      evidenceNature: item.evidenceNature,
      classificationConfidence: item.classificationConfidence,
      sourceRole: item.sourceRole,
      originalPublishedAt: item.originalPublishedAt,
      originalLanguage: item.originalLanguage,
      originalTitle: item.originalTitle,
      originalContent: item.originalContent,
      contentCompleteness: item.contentCompleteness,
      contentGroup: "information",
      itemKind: "article",
      provenanceRole: "canonical",
      provenanceStatus: "verified",
      sourceStream: "information",
      originPlatform: "web",
    },
  })),
  sourceReports: informationItems.map((item) => ({
    sourceId: item.sourceChannelId,
    adapter: "e2e",
    status: "succeeded",
    startedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
    completedAt: iso,
    recordCount: 1,
  })),
};

const raw = JSON.stringify(packet);
const bodyHash = createHash("sha256").update(raw).digest("hex");
const timestamp = String(Math.floor(Date.now() / 1000));
const signature = createHmac("sha256", secret)
  .update(`${timestamp}.${batchId}.${bodyHash}`)
  .digest("base64url");
const baseHeaders = {
  "Content-Type": "application/json",
  "X-Vault2077-Batch-Id": batchId,
  "X-Vault2077-Key-Id": "e2e",
  "X-Vault2077-Timestamp": timestamp,
};

const rejected = await fetch(`${origin}/api/internal/acquisition`, {
  method: "POST",
  headers: { ...baseHeaders, "X-Vault2077-Signature": "sha256=invalid" },
  body: raw,
});
assert.equal(rejected.status, 401, "invalid HMAC must be rejected");

const accepted = await fetch(`${origin}/api/internal/acquisition`, {
  method: "POST",
  headers: { ...baseHeaders, "X-Vault2077-Signature": `sha256=${signature}` },
  body: raw,
});
assert.equal(accepted.status, 202, `valid packet must be durably accepted: ${await accepted.text()}`);

const processed = await fetch(`${origin}/api/internal/acquisition/process`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${secret}`, "Content-Type": "application/json" },
  body: JSON.stringify({ maxBatches: 20 }),
});
const processBody = await processed.text();
assert.equal(processed.status, 200, `worker must process the queue: ${processBody}`);
const result = JSON.parse(processBody);
assert.ok(result.processed.some((item) => item.batchId === batchId && item.result.information >= 3));

async function waitForPublishedFeed() {
  const deadline = Date.now() + 35_000;
  let lastStatus = 0;
  let lastHtml = "";
  while (Date.now() < deadline) {
    const feed = await fetch(`${origin}/feed`, { cache: "no-store" });
    lastStatus = feed.status;
    lastHtml = await feed.text();
    if (
      feed.ok
      && /测试事件/.test(lastHtml)
      && /中译：\[event\] Source/.test(lastHtml)
    ) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail(`published feed did not become visible (status ${lastStatus}): ${lastHtml.slice(0, 500)}`);
}

await waitForPublishedFeed();

console.log(JSON.stringify({ ok: true, batchId, accepted: 202, processed: result.processed.length, eventPublished: true }));
