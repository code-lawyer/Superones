import assert from "node:assert/strict";
import test from "node:test";
import { mergeSicContentItems } from "../lib/sic-content-store.ts";
import type { SicContentItem } from "../lib/sic-content-types.ts";

function item(id: string, collectedAt: string): SicContentItem {
  return {
    id,
    sourceId: "catalog-source",
    group: "courses",
    sourceName: "Catalog Source",
    publisher: "Catalog Publisher",
    title: `Course ${id}`,
    summary: `Summary ${id}`,
    url: `https://example.com/courses/${id}`,
    publishedAt: null,
    collectedAt,
  };
}

test("a partial catalog response cannot erase previously processed SiC items", () => {
  const previous = [
    { ...item("one", "2026-07-24T00:00:00.000Z"), translatedTitle: "课程一" },
    { ...item("two", "2026-07-24T00:00:00.000Z"), translatedTitle: "课程二" },
  ];
  const current = [item("one", "2026-07-25T00:00:00.000Z")];
  const merged = mergeSicContentItems(previous, current);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((value) => value.id === "one")?.translatedTitle, "课程一");
  assert.equal(merged.find((value) => value.id === "two")?.translatedTitle, "课程二");
});

test("locale query variants collapse to one canonical SiC item", () => {
  const localized = {
    ...item("localized", "2026-07-24T00:00:00.000Z"),
    url: "https://developers.google.com/machine-learning/crash-course?hl=hi",
    translatedTitle: "机器学习速成课程",
  };
  const canonical = {
    ...item("canonical", "2026-07-25T00:00:00.000Z"),
    url: "https://developers.google.com/machine-learning/crash-course",
  };
  const merged = mergeSicContentItems([localized], [canonical]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "canonical");
  assert.equal(merged[0].translatedTitle, "机器学习速成课程");
});

test("an authoritative Google catalog refresh removes stale locale-only entries", () => {
  const stale = {
    ...item("stale", "2026-07-24T00:00:00.000Z"),
    sourceId: "google-ml-courses",
    url: "https://developers.google.com/machine-learning/testing-debugging?hl=hi",
  };
  const current = {
    ...item("current", "2026-07-25T00:00:00.000Z"),
    sourceId: "google-ml-courses",
    url: "https://developers.google.com/machine-learning/crash-course",
  };
  const merged = mergeSicContentItems([stale], [current], {
    replaceSourceIds: new Set(["google-ml-courses"]),
  });
  assert.deepEqual(merged.map((value) => value.id), ["current"]);
});
