import assert from "node:assert/strict";
import test from "node:test";
import { auditEventCandidateGroups } from "../lib/event-reconciliation.ts";
import type { InformationItem, SourceRole } from "../lib/types.ts";

function item(
  slug: string,
  publisher: string,
  sourceRole: SourceRole,
  contentGroup: InformationItem["contentGroup"] = "information",
): InformationItem {
  return {
    slug,
    translatedTitle: slug,
    originalTitle: slug,
    summary: slug,
    translatedContent: slug,
    originalContent: slug,
    originalLanguage: "en",
    sourceName: publisher,
    sourceRole,
    sourceUrl: `https://example.com/${slug}`,
    author: publisher,
    publishedAt: "2026-07-30T00:00:00Z",
    discoveredAt: "2026-07-30T00:00:00Z",
    eventSlugs: [],
    originalDisplay: "full",
    originalPublisher: publisher,
    ownerEntity: publisher,
    contentGroup,
  };
}

test("event reconciliation accepts only information groups that meet the evidence threshold", () => {
  const information = [
    item("a", "publisher-a", "官方"),
    item("b", "publisher-b", "媒体"),
    item("c", "publisher-b", "媒体"),
    item("roadside", "publisher-c", "评论", "roadside"),
  ];
  const result = auditEventCandidateGroups({
    groups: [
      { candidateKey: "roadside", informationSlugs: ["a", "b", "roadside"] },
      { candidateKey: "too-small", informationSlugs: ["a", "b"] },
      { candidateKey: "accepted", informationSlugs: ["a", "b", "c"] },
    ],
  }, information);

  assert.deepEqual(result.accepted.map((group) => group.candidateKey), ["accepted"]);
  assert.deepEqual(result.rejected.map((group) => group.reason), [
    "unknown-or-ineligible-information",
    "event-threshold-not-met",
  ]);
});

test("event reconciliation rejects overlapping model-proposed groups", () => {
  const information = [
    item("a", "publisher-a", "官方"),
    item("b", "publisher-b", "媒体"),
    item("c", "publisher-b", "媒体"),
    item("d", "publisher-c", "研究"),
    item("e", "publisher-d", "媒体"),
  ];
  const result = auditEventCandidateGroups({
    groups: [
      { candidateKey: "first", informationSlugs: ["a", "b", "c"] },
      { candidateKey: "second", informationSlugs: ["a", "d", "e"] },
    ],
  }, information);

  assert.equal(result.accepted.length, 1);
  assert.deepEqual(result.rejected, [{
    candidateKey: "second",
    reason: "overlapping-information",
  }]);
});
