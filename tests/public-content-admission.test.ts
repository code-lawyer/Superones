import assert from "node:assert/strict";
import test from "node:test";
import { admittedPublicRecords } from "../lib/public-record-admission.ts";
import type { EventRecord, InformationItem } from "../lib/types.ts";

function information(slug: string, overrides: Partial<InformationItem> = {}): InformationItem {
  return {
    slug,
    translatedTitle: slug,
    originalTitle: slug,
    summary: slug,
    translatedContent: slug,
    originalContent: slug,
    originalLanguage: "en",
    sourceName: "source",
    sourceRole: "官方",
    sourceUrl: `https://example.test/${slug}`,
    author: "author",
    publishedAt: "2026-08-13T00:00:00.000Z",
    discoveredAt: "2026-08-13T00:00:00.000Z",
    eventSlugs: ["event"],
    primaryEventSlug: "event",
    originalDisplay: "full",
    ...overrides,
  };
}

function event(sources: EventRecord["sources"]): EventRecord {
  return {
    slug: "event",
    record: "event",
    category: "模型与产品",
    title: "event",
    summary: "event",
    significance: "event",
    entities: [],
    firstSeen: "2026-08-13T00:00:00.000Z",
    updated: "2026-08-13T00:00:00.000Z",
    sources,
  };
}

test("public records remove events that reference rejected prerelease or draft information", () => {
  const stable = information("stable");
  const draft = information("draft", { itemKind: "release", releaseDraft: true });
  const records = admittedPublicRecords([
    event([{ name: "source", url: draft.sourceUrl, publishedAt: draft.publishedAt!, informationSlug: draft.slug }]),
  ], [stable, draft]);

  assert.deepEqual(records.events, []);
  assert.deepEqual(records.information.map((item) => item.slug), ["stable"]);
  assert.deepEqual(records.information[0].eventSlugs, []);
  assert.equal(records.information[0].primaryEventSlug, undefined);
});
