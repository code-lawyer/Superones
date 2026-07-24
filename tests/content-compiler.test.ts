import assert from "node:assert/strict";
import test from "node:test";
import { activeEvents, compileInformationBatch, meetsEventThreshold, withOneRetry, type EditorialPort } from "../lib/content-compiler.ts";
import type { InboundContentBatch, InformationEnvelope } from "../lib/content-contract.ts";
import type { EventRecord, InformationItem, SourceRole } from "../lib/types.ts";

function envelope(index: number, publisher: string, sourceRole: SourceRole): InformationEnvelope {
  return {
    idempotencyKey: `item-${index}`,
    sourceChannelId: `channel-${publisher}`,
    discoveryPath: `approved-feed:${publisher}`,
    originalPublisher: publisher,
    sourceRole,
    originalUrl: `https://example.com/${index}`,
    originalPublishedAt: `2026-07-2${index}T09:00:00.000Z`,
    fetchedAt: "2026-07-22T10:00:00.000Z",
    originalLanguage: "en",
    originalTitle: `Original title ${index}`,
    originalContent: `Original content ${index}`,
    contentCompleteness: "fulltext",
    contentHash: String(index).repeat(64),
  };
}

function batch(information: InformationEnvelope[]): InboundContentBatch {
  return {
    version: 2,
    batchId: "vault2077-202607221200-test",
    sourceBundleRevision: "test-v1",
    collectedFrom: "2026-07-22T04:00:00.000Z",
    collectedUntil: "2026-07-22T10:00:00.000Z",
    generatedAt: "2026-07-22T10:01:00.000Z",
    information,
    repositories: [],
  };
}

function editorial(overrides: Partial<EditorialPort> = {}): EditorialPort {
  return {
    async translateInformation(item) {
      return { translatedTitle: `中文 ${item.originalTitle}`, summary: `摘要 ${item.originalTitle}`, translatedContent: `译文 ${item.originalContent}` };
    },
    async classifyInformation() {
      return { disposition: "candidate", candidateKey: "same-event", directionAligned: true };
    },
    async composeEvent() {
      return { title: "重大模型正式发布", judgment: "能力边界出现明确变化", summary: "综合摘要", significance: "影响判断", entities: ["Example AI"], category: "模型与产品" };
    },
    ...overrides,
  };
}

function existingFixture() {
  const information: InformationItem = {
    slug: "existing-information",
    translatedTitle: "既有资讯",
    originalTitle: "Existing information",
    summary: "既有摘要",
    translatedContent: "既有译文",
    originalContent: "Existing content",
    originalLanguage: "en",
    sourceName: "A",
    sourceRole: "官方",
    sourceUrl: "https://example.com/existing",
    author: "author",
    publishedAt: "2026-07-10T00:00:00Z",
    discoveredAt: "2026-07-10T00:01:00Z",
    eventSlugs: ["existing-event"],
    primaryEventSlug: "existing-event",
    originalDisplay: "full",
    contentHash: "e".repeat(64),
    originalPublisher: "A",
  };
  const event: EventRecord = {
    slug: "existing-event",
    record: "VLT/EVT/2026/00001",
    category: "模型与产品",
    title: "既有事件",
    summary: "既有事件摘要",
    significance: "既有判断",
    entities: [],
    firstSeen: "2026-07-10T00:00:00Z",
    updated: "2026-07-10T00:00:00Z",
    sources: [{ name: "A", url: information.sourceUrl, publishedAt: information.publishedAt!, informationSlug: information.slug }],
  };
  return { information, event };
}

test("one information item remains in the waterfall and does not create an event", async () => {
  const result = await compileInformationBatch({ batch: batch([envelope(1, "A", "官方")]), previousInformation: [], previousEvents: [], editorial: editorial() });
  assert.equal(result.information.length, 1);
  assert.equal(result.events.length, 0);
  assert.deepEqual(result.information[0].eventSlugs, []);
});

test("three aligned items from two publishers and roles form one event", async () => {
  const result = await compileInformationBatch({
    batch: batch([envelope(1, "A", "官方"), envelope(2, "B", "媒体"), envelope(3, "B", "媒体")]),
    previousInformation: [],
    previousEvents: [],
    editorial: editorial(),
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].sources?.length, 3);
  assert.ok(result.information.every((item) => item.primaryEventSlug === result.events[0].slug));
});

test("event threshold requires both owner entity and role diversity", () => {
  const base = (publisher: string, sourceRole: SourceRole, ownerEntity = publisher): InformationItem => ({
    slug: Math.random().toString(), translatedTitle: "中", originalTitle: "EN", summary: "摘要", translatedContent: "译文", originalContent: "original", originalLanguage: "en",
    sourceName: publisher, sourceRole, sourceUrl: "https://example.com", author: "a", publishedAt: null, discoveredAt: "2026-07-22T10:00:00Z", eventSlugs: [], originalDisplay: "full", originalPublisher: publisher, ownerEntity,
  });
  assert.equal(meetsEventThreshold([base("A", "官方"), base("A", "媒体"), base("A", "媒体")]), false);
  assert.equal(meetsEventThreshold([base("A", "官方"), base("B", "官方"), base("B", "官方")]), false);
  assert.equal(meetsEventThreshold([base("A", "官方"), base("B", "媒体"), base("B", "媒体")]), true);
  assert.equal(meetsEventThreshold([base("A Blog", "官方", "entity:a"), base("A X", "媒体", "entity:a"), base("B", "媒体", "entity:b")]), true);
  assert.equal(meetsEventThreshold([base("A Blog", "官方", "entity:a"), base("A X", "媒体", "entity:a"), base("A Podcast", "媒体", "entity:a")]), false);
  assert.equal(meetsEventThreshold([
    { ...base("A", "官方", "entity:a"), classificationConfidence: "high" },
    { ...base("B", "媒体", "entity:b"), classificationConfidence: "low" },
    { ...base("B second", "媒体", "entity:b"), classificationConfidence: "low" },
  ]), false);
});

test("events leave matching candidates after 30 inactive days", () => {
  const event = (slug: string, updated: string): EventRecord => ({ slug, record: slug, category: "模型与产品", title: slug, summary: slug, significance: slug, entities: [], firstSeen: updated, updated });
  assert.deepEqual(activeEvents([event("old", "2026-06-01T00:00:00Z"), event("new", "2026-07-10T00:00:00Z")], "2026-07-22T00:00:00Z").map((item) => item.slug), ["new"]);
});

test("new information can join and recompose an active event", async () => {
  const fixture = existingFixture();
  const result = await compileInformationBatch({
    batch: batch([envelope(1, "B", "媒体")]),
    previousInformation: [fixture.information],
    previousEvents: [fixture.event],
    editorial: editorial({ async classifyInformation() { return { disposition: "existing", eventSlug: fixture.event.slug }; } }),
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].sources?.length, 2);
  assert.equal(result.information.find((item) => item.slug !== fixture.information.slug)?.primaryEventSlug, fixture.event.slug);
});

test("a failed event recomposition keeps the last event and hides the new record", async () => {
  const fixture = existingFixture();
  const result = await compileInformationBatch({
    batch: batch([envelope(1, "B", "媒体")]),
    previousInformation: [fixture.information],
    previousEvents: [fixture.event],
    editorial: editorial({
      async classifyInformation() { return { disposition: "existing", eventSlug: fixture.event.slug }; },
      async composeEvent() { throw new Error("compose unavailable"); },
    }),
  });
  assert.equal(result.events[0].summary, fixture.event.summary);
  assert.deepEqual(result.information.map((item) => item.slug), [fixture.information.slug]);
  assert.equal(result.quarantine[0].errorCode, "EVENT_COMPOSITION_FAILED");
});

test("model operation retries exactly once", async () => {
  let attempts = 0;
  await assert.rejects(() => withOneRetry(async () => { attempts += 1; throw new Error("down"); }), /down/);
  assert.equal(attempts, 2);
});

test("missing batched editorial results fall back to single-record processing", async () => {
  const first = envelope(1, "A", "官方");
  const second = envelope(2, "B", "媒体");
  const translated: string[] = [];
  const classified: string[] = [];
  const result = await compileInformationBatch({
    batch: batch([first, second]),
    previousInformation: [],
    previousEvents: [],
    editorial: editorial({
      async processInformationBatch() {
        return [{
          idempotencyKey: first.idempotencyKey,
          translatedTitle: "第一条",
          summary: "第一条摘要",
          translatedContent: "第一条译文",
          decision: { disposition: "independent" },
        }];
      },
      async translateInformation(item) {
        translated.push(item.idempotencyKey);
        return {
          translatedTitle: "第二条",
          summary: "第二条摘要",
          translatedContent: "第二条译文",
        };
      },
      async classifyInformation(input) {
        classified.push(input.information.originalTitle);
        return { disposition: "independent" };
      },
    }),
  });
  assert.equal(result.information.length, 2);
  assert.equal(result.quarantine.length, 0);
  assert.deepEqual(translated, [second.idempotencyKey]);
  assert.deepEqual(classified, [second.originalTitle]);
});

test("failed information editorial is quarantined and never published", async () => {
  const result = await compileInformationBatch({
    batch: batch([envelope(1, "A", "官方")]),
    previousInformation: [],
    previousEvents: [],
    editorial: editorial({ async translateInformation() { throw new Error("model unavailable"); } }),
  });
  assert.equal(result.information.length, 0);
  assert.equal(result.quarantine.length, 1);
  assert.equal(result.quarantine[0].errorCode, "INFORMATION_EDITORIAL_FAILED");
});

test("failed event classification is quarantined and never published", async () => {
  const result = await compileInformationBatch({
    batch: batch([envelope(1, "A", "官方")]),
    previousInformation: [],
    previousEvents: [],
    editorial: editorial({ async classifyInformation() { throw new Error("classification unavailable"); } }),
  });
  assert.equal(result.information.length, 0);
  assert.equal(result.quarantine[0].errorCode, "EVENT_CLASSIFICATION_FAILED");
});

test("exact duplicate content from another URL is processed once", async () => {
  const first = envelope(1, "A", "官方");
  const second = { ...envelope(2, "B", "媒体"), contentHash: first.contentHash };
  const result = await compileInformationBatch({ batch: batch([first, second]), previousInformation: [], previousEvents: [], editorial: editorial() });
  assert.equal(result.information.length, 1);
});

test("classification receives the newest 50 independent records", async () => {
  const previous = Array.from({ length: 60 }, (_, index): InformationItem => ({
    slug: `previous-${index}`,
    translatedTitle: `资讯 ${index}`,
    originalTitle: `Information ${index}`,
    summary: `摘要 ${index}`,
    translatedContent: `译文 ${index}`,
    originalContent: `Original ${index}`,
    originalLanguage: "en",
    sourceName: `Source ${index}`,
    sourceRole: "媒体",
    sourceUrl: `https://example.com/previous/${index}`,
    author: "author",
    publishedAt: new Date(Date.parse("2026-07-22T10:00:00Z") - index * 60_000).toISOString(),
    discoveredAt: new Date(Date.parse("2026-07-22T10:00:00Z") - index * 60_000).toISOString(),
    eventSlugs: [],
    originalDisplay: "full",
    contentHash: index.toString(16).padStart(64, "0"),
    originalPublisher: `Source ${index}`,
  })).reverse();
  let supplied: string[] = [];
  await compileInformationBatch({
    batch: batch([envelope(1, "A", "官方")]),
    previousInformation: previous,
    previousEvents: [],
    editorial: editorial({
      async classifyInformation(input) {
        supplied = input.recentIndependent.map((item) => item.slug);
        return { disposition: "independent" };
      },
    }),
  });
  assert.equal(supplied.length, 50);
  assert.equal(supplied[0], "previous-0");
  assert.equal(supplied.at(-1), "previous-49");
});
