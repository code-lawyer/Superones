import assert from "node:assert/strict";
import test from "node:test";
import { latestSicContentPerSource } from "../lib/sic-content.ts";
import type { SicContentItem } from "../lib/sic-content-types.ts";

function item(sourceId: string, publishedAt: string, title: string): SicContentItem {
  return {
    id: `${sourceId}-${publishedAt}`,
    sourceId,
    group: "courses",
    sourceName: sourceId,
    publisher: sourceId,
    title,
    summary: `${title} summary`,
    url: `https://example.com/${sourceId}/${title}`,
    publishedAt,
    collectedAt: "2026-07-23T12:00:00.000Z",
  };
}

test("SiC reading groups keep only the newest update from each fixed source", () => {
  const selected = latestSicContentPerSource([
    item("google-courses", "2026-07-20T08:00:00.000Z", "old lesson"),
    item("stanford-hai", "2026-07-22T08:00:00.000Z", "latest lecture"),
    item("google-courses", "2026-07-23T08:00:00.000Z", "latest lesson"),
  ]);

  assert.deepEqual(selected.map((entry) => entry.title), ["latest lesson", "latest lecture"]);
});
