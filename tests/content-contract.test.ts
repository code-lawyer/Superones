import assert from "node:assert/strict";
import test from "node:test";
import { canonicalInformationKey, signingInput, validateContentBatch } from "../lib/content-contract.ts";

function batch() {
  return {
    version: 2,
    batchId: "vault2077-202607221200-demo",
    sourceBundleRevision: "manual-v1",
    collectedFrom: "2026-07-22T04:00:00.000Z",
    collectedUntil: "2026-07-22T10:00:00.000Z",
    generatedAt: "2026-07-22T10:01:00.000Z",
    information: [{
      idempotencyKey: "source:item:1",
      sourceChannelId: "source-one",
      discoveryPath: "approved-feed:source-one",
      originalPublisher: "Publisher One",
      ownerEntity: "entity:publisher-one",
      publisherKind: "organization",
      evidenceNature: "primary",
      classificationConfidence: "high",
      sourceRole: "官方",
      originalUrl: "https://example.com/story?utm_source=test",
      originalPublishedAt: "2026-07-22T09:00:00.000Z",
      fetchedAt: "2026-07-22T10:00:00.000Z",
      originalLanguage: "en",
      originalTitle: "A material event",
      originalContent: "Original English content.",
      contentCompleteness: "fulltext",
      contentHash: "a".repeat(64),
    }],
    repositories: [],
  };
}

test("v2 contract preserves original fields and normalizes timestamps", () => {
  const result = validateContentBatch(batch());
  assert.equal(result.version, 2);
  assert.equal(result.information[0].originalContent, "Original English content.");
  assert.equal(result.information[0].sourceRole, "官方");
  assert.equal(result.information[0].ownerEntity, "entity:publisher-one");
  assert.equal(result.generatedAt, "2026-07-22T10:01:00.000Z");
});

test("contract rejects a non-sha256 content hash", () => {
  const value = batch();
  value.information[0].contentHash = "not-a-hash";
  assert.throws(() => validateContentBatch(value), /contentHash/);
});

test("contract rejects an unknown publisher taxonomy value", () => {
  const value = batch();
  value.information[0].publisherKind = "influencer";
  assert.throws(() => validateContentBatch(value), /publisherKind/);
});

test("canonical key ignores URL query noise but retains content identity", () => {
  assert.equal(
    canonicalInformationKey({ originalUrl: "https://example.com/story?utm=x", contentHash: "abc" }),
    "https://example.com/story#abc",
  );
});

test("signature input is stable and ordered", () => {
  assert.equal(signingInput("123", "batch-1", "deadbeef"), "123.batch-1.deadbeef");
});
