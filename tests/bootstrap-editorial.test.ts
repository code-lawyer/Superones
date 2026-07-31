import assert from "node:assert/strict";
import test from "node:test";
import {
  bootstrapInformationEditorial,
  createBootstrapEditorialPort,
} from "../lib/bootstrap-editorial.ts";
import type { InformationEnvelope } from "../lib/content-contract.ts";

const item = {
  idempotencyKey: "information:test",
  sourceChannelId: "test-source",
  discoveryPath: "rss",
  originalPublisher: "Example",
  sourceRole: "官方",
  originalUrl: "https://example.com/post",
  fetchedAt: "2026-07-30T00:00:00.000Z",
  originalLanguage: "en",
  originalTitle: "An English title",
  originalContent: "  First line.\n\nSecond line.  ",
  contentCompleteness: "fulltext",
  contentHash: "a".repeat(64),
  contentGroup: "information",
  itemKind: "article",
  provenanceRole: "canonical",
  provenanceStatus: "verified",
} satisfies InformationEnvelope;

test("bootstrap editorial preserves source text without a model call", () => {
  assert.deepEqual(bootstrapInformationEditorial(item), {
    translatedTitle: "An English title",
    summary: "First line. Second line.",
    translatedContent: "First line.\n\nSecond line.",
  });
});

test("bootstrap editorial classifies cold-start records as independent", async () => {
  const port = createBootstrapEditorialPort();
  const values = await port.processInformationBatch?.({
    information: [item],
    activeEvents: [],
    recentIndependent: [],
  });
  assert.equal(values?.[0].decision.disposition, "independent");
});
