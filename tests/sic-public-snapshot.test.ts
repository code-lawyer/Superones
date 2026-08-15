import assert from "node:assert/strict";
import test from "node:test";
import {
  sicPublicPage,
  sicPublicGroupSnapshotId,
  toSicPublicRecord,
} from "../lib/sic-public-projection.ts";
import type { SicContentByGroup } from "../lib/sic-content.ts";
import type { SicContentItem } from "../lib/sic-content-types.ts";

function item(index: number): SicContentItem {
  return {
    id: `paper-${index}`,
    sourceId: "internal-source-id",
    group: "papers",
    sourceName: "公开来源",
    publisher: "internal publisher",
    title: `Paper ${index}`,
    description: `公开说明 ${index}`,
    summary: `备用摘要 ${index}`,
    contentSummary: `正文摘要 ${index}`,
    url: `https://example.com/papers/${index}`,
    discoveryUrl: "https://example.com/private-discovery-feed",
    publishedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    collectedAt: "2026-08-14T00:00:00.000Z",
    weeklyRank: index + 1,
    weeklyUpvotes: 100 - index,
  };
}

function content(papers: SicContentItem[]): SicContentByGroup {
  return { papers, documents: [], courses: [], podcasts: [] };
}

test("SiC public projection includes display fields and drops acquisition metadata", () => {
  const projected = toSicPublicRecord(item(0));
  assert.equal(projected.summary, "公开说明 0");
  assert.equal(projected.publishedAt, "2026-08-01T00:00:00.000Z");
  assert.equal("sourceId" in projected, false);
  assert.equal("publisher" in projected, false);
  assert.equal("discoveryUrl" in projected, false);
  assert.equal("weeklyUpvotes" in projected, false);
});

test("SiC pagination snapshot identity changes only with its own content group", () => {
  const initial = content([item(0), item(1)]);
  assert.equal(
    sicPublicGroupSnapshotId(initial, "papers"),
    sicPublicGroupSnapshotId(content([item(0), item(1)]), "papers"),
  );
  assert.notEqual(
    sicPublicGroupSnapshotId(initial, "papers"),
    sicPublicGroupSnapshotId(content([item(0), item(2)]), "papers"),
  );
  const unrelatedDocument = { ...item(2), id: "document-2", group: "documents" as const };
  const withDocument = { ...initial, documents: [unrelatedDocument] };

  assert.equal(
    sicPublicGroupSnapshotId(initial, "papers"),
    sicPublicGroupSnapshotId(withDocument, "papers"),
  );
  assert.notEqual(
    sicPublicGroupSnapshotId(initial, "documents"),
    sicPublicGroupSnapshotId(withDocument, "documents"),
  );
});

test("SiC public page returns one bounded batch from a single snapshot", () => {
  const page = sicPublicPage(content(Array.from({ length: 12 }, (_, index) => item(index))), "snapshot-1", "papers", 4, 5);
  assert.equal(page.items.length, 5);
  assert.equal(page.items[0]?.id, "paper-4");
  assert.equal(page.nextOffset, 9);
  assert.equal(page.totalCount, 12);
  assert.equal(page.snapshotId, "snapshot-1");
  assert.ok(page.items.every((record) => !("sourceId" in record)));
});
