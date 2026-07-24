import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";

const origin = (process.env.VAULT2077_E2E_ORIGIN ?? "http://127.0.0.1:3021").replace(/\/+$/, "");
const secret = process.env.VAULT2077_E2E_SECRET ?? "vault2077-e2e-shared-secret";
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

const packet = {
  version: 2,
  batchId,
  sourceBundleRevision: "e2e-source-bundle-v1",
  collectedFrom: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
  collectedUntil: iso,
  generatedAt: iso,
  information: [
    information(1, "官方", "Example AI", "organization:example-ai"),
    information(2, "媒体", "Example Research", "media:example-research"),
    information(3, "媒体", "Example Review", "media:example-review"),
  ],
  repositories: [],
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
  "X-Vault2077-Timestamp": timestamp,
};

const rejected = await fetch(`${origin}/api/internal/content`, {
  method: "POST",
  headers: { ...baseHeaders, "X-Vault2077-Signature": "sha256=invalid" },
  body: raw,
});
assert.equal(rejected.status, 401, "invalid HMAC must be rejected");

const accepted = await fetch(`${origin}/api/internal/content`, {
  method: "POST",
  headers: { ...baseHeaders, "X-Vault2077-Signature": `sha256=${signature}` },
  body: raw,
});
assert.equal(accepted.status, 202, `valid packet must be durably accepted: ${await accepted.text()}`);

const processed = await fetch(`${origin}/api/internal/content/process`, {
  method: "POST",
  headers: { "Authorization": `Bearer ${secret}`, "Content-Type": "application/json" },
  body: JSON.stringify({ maxBatches: 20 }),
});
const processBody = await processed.text();
assert.equal(processed.status, 200, `worker must process the queue: ${processBody}`);
const result = JSON.parse(processBody);
assert.ok(result.processed.some((item) => item.batchId === batchId && item.information >= 3 && item.events >= 1));

const feed = await fetch(`${origin}/feed`);
const html = await feed.text();
assert.equal(feed.status, 200);
assert.match(html, /测试事件/);
assert.match(html, /中译：\[event\] Source/);

console.log(JSON.stringify({ ok: true, batchId, accepted: 202, processed: result.processed.length, eventPublished: true }));
