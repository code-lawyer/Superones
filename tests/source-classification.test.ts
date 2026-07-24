import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const registry = JSON.parse(await readFile(new URL("../config/source-registry.json", import.meta.url), "utf8"));
const bundle = JSON.parse(await readFile(new URL("../config/source-bundle.json", import.meta.url), "utf8"));

test("every registered source has complete classification provenance", () => {
  assert.equal(registry.channels.length, 475);
  assert.match(registry.classification.overridesHash, /^[a-f0-9]{64}$/);
  for (const channel of registry.channels) {
    assert.ok(channel.ownerEntity, channel.identity);
    assert.ok(channel.publisherKind, channel.identity);
    assert.ok(channel.evidenceNature, channel.identity);
    assert.ok(channel.primaryLanguage, channel.identity);
    assert.ok(channel.geography, channel.identity);
    assert.ok(["high", "medium", "low"].includes(channel.classification?.confidence), channel.identity);
    assert.equal(channel.classification?.version, 1, channel.identity);
  }
});

test("curated aliases collapse cross-carrier OpenAI channels into one owner entity", () => {
  const channels = registry.channels.filter((channel: { publisherName: string }) => ["OpenAI", "OpenAI Blog"].includes(channel.publisherName));
  assert.ok(channels.length >= 2);
  assert.deepEqual(new Set(channels.map((channel: { ownerEntity: string }) => channel.ownerEntity)), new Set(["entity:openai"]));
  assert.ok(channels.every((channel: { evidenceNature: string }) => channel.evidenceNature === "primary"));
});

test("discovery signals cannot masquerade as original publishers", () => {
  const channels = registry.channels.filter((channel: { channelType: string }) => ["github-trending", "hotlist", "news-search", "dynamic-aggregate-list"].includes(channel.channelType));
  assert.ok(channels.length > 0);
  assert.ok(channels.every((channel: { evidenceNature: string }) => channel.evidenceNature === "discovery_aggregate"));
});

test("runtime bundle preserves taxonomy for every active source", () => {
  assert.ok(bundle.sources.length > 0);
  assert.ok(bundle.sources.every((source: Record<string, unknown>) => source.ownerEntity && source.publisherKind && source.evidenceNature && source.classificationConfidence));
});

test("runtime bundle excludes mainland origin platforms without filtering content language", () => {
  assert.ok(bundle.sources.some((source: { channelType: string; primaryLanguage: string }) => source.channelType === "x" && source.primaryLanguage === "zh-CN"));
  assert.ok(bundle.sources.every((source: { endpoint: string }) => !source.endpoint.includes("wechat2rss")));
  assert.ok(bundle.sources.every((source: { endpoint: string }) => !source.endpoint.includes("/xiaoyuzhou/")));
  assert.ok(bundle.sources.every((source: { channelType: string }) => source.channelType !== "hotlist"));
  assert.ok(bundle.sources.every((source: { connector: string }) => !["html-index", "github-trending-html", "telegram-html"].includes(source.connector)));
  assert.ok(bundle.pending.some((source: { reason: string }) => source.reason === "mainland_origin_platform"));
  assert.ok(bundle.pending.some((source: { reason: string }) => source.reason === "unverified_direct_publisher_origin"));
  assert.ok(bundle.pending.some((source: { reason: string }) => source.reason === "unstructured_html_connector_disallowed"));
});

test("video-only YouTube channels never enter the registry or runtime bundle", () => {
  assert.ok(registry.channels.every((source: { channelType: string }) => source.channelType !== "youtube"));
  assert.ok(bundle.sources.every((source: { channelType: string }) => source.channelType !== "youtube"));
  assert.ok(bundle.pending.every((source: { channelType: string }) => source.channelType !== "youtube"));
});
