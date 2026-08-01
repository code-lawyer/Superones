import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const registry = JSON.parse(await readFile(new URL("../config/source-registry.json", import.meta.url), "utf8"));
const bundle = JSON.parse(await readFile(new URL("../config/source-bundle.json", import.meta.url), "utf8"));
const institutionalNewsRegistry = JSON.parse(await readFile(new URL("../config/institutional-news-registry.json", import.meta.url), "utf8"));
const sicRegistry = JSON.parse(await readFile(new URL("../config/sic-source-registry.json", import.meta.url), "utf8"));

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

test("runtime bundle uses deterministic content groups and excludes misplaced source types", () => {
  assert.ok(bundle.sources.every((source: { contentGroup: string }) => (
    ["information", "roadside"].includes(source.contentGroup)
  )));
  assert.ok(bundle.sources.every((source: { channelType: string }) => source.channelType !== "github-user-events"));
  assert.ok(bundle.sources.every((source: { channelType: string }) => source.channelType !== "podcast"));
  assert.equal(bundle.sources.filter((source: { contentGroup: string }) => source.contentGroup === "information").length, 17);
  assert.equal(bundle.sources.filter((source: { contentGroup: string }) => source.contentGroup === "documents").length, 0);
  assert.equal(bundle.sources.filter((source: { contentGroup: string }) => source.contentGroup === "roadside").length, 37);
  assert.ok(bundle.sources
    .filter((source: { channelType: string }) => source.channelType === "community")
    .every((source: { provenanceRole: string; provenanceStatus: string }) => (
      source.provenanceRole === "canonical" && source.provenanceStatus === "verified"
    )));
  assert.ok(bundle.pending.some((source: { reason: string }) => source.reason === "institutional_source_requires_curated_single_destination"));
});

test("approved institutional news and SiC documents have one production destination", () => {
  const approvedNews = institutionalNewsRegistry.sources.filter((source: { status: string }) => source.status === "approved");
  const approvedDocuments = sicRegistry.sources.filter((source: { status: string; group: string }) => (
    source.status === "approved" && source.group === "documents"
  ));
  assert.ok(approvedNews.every((source: { name: string }) => bundle.sources.some((candidate: { name: string; contentGroup: string }) => (
    candidate.name === source.name && candidate.contentGroup === "information"
  ))));
  assert.ok(approvedDocuments.every((source: { name: string }) => !bundle.sources.some((candidate: { name: string }) => (
    candidate.name === source.name
  ))));
  for (const news of bundle.sources.filter((source: { channelType: string }) => source.channelType === "official-news")) {
    const sameTransportDocuments = approvedDocuments.filter((source: { endpoint: string }) => source.endpoint === news.endpoint);
    if (sameTransportDocuments.length > 0) {
      assert.ok(news.pathPrefix);
      assert.ok(sameTransportDocuments.every((source: { homeUrl: string }) => !new URL(source.homeUrl).pathname.startsWith(news.pathPrefix)));
    }
  }
});

test("runtime bundle excludes mainland origin platforms without filtering content language", () => {
  assert.ok(bundle.pending.some((source: { primaryLanguage: string; reason: string }) => source.primaryLanguage === "zh-CN" && source.reason === "mainland_origin_platform"));
  assert.ok(bundle.pending.every((source: { reason: string }) => source.reason !== "unsupported_language"));
  assert.ok(bundle.sources.every((source: { endpoint: string }) => !source.endpoint.includes("wechat2rss")));
  assert.ok(bundle.sources.every((source: { endpoint: string }) => !source.endpoint.includes("/xiaoyuzhou/")));
  assert.ok(bundle.sources.every((source: { channelType: string }) => source.channelType !== "hotlist"));
  assert.ok(bundle.sources.every((source: { connector: string }) => !["html-index", "github-trending-html", "telegram-html"].includes(source.connector)));
  assert.ok(bundle.pending.some((source: { reason: string }) => source.reason === "mainland_origin_platform"));
  assert.ok(bundle.pending.some((source: { reason: string }) => source.reason === "unverified_direct_publisher_origin"));
  assert.ok(bundle.pending.some((source: { reason: string }) => source.reason === "platform_ranking_moved_to_direct_lane"));
  assert.ok(bundle.pending.some((source: { id: string; reason: string }) => (
    source.id === "source-90b028b6f17d93e0"
    && source.reason === "upstream_blocks_unattended_github_actions"
  )));
  assert.ok(bundle.sources.every((source: { id: string }) => source.id !== "source-90b028b6f17d93e0"));
});

test("video-only YouTube channels never enter the registry or runtime bundle", () => {
  assert.ok(registry.channels.every((source: { channelType: string }) => source.channelType !== "youtube"));
  assert.ok(bundle.sources.every((source: { channelType: string }) => source.channelType !== "youtube"));
  assert.ok(bundle.pending.every((source: { channelType: string }) => source.channelType !== "youtube"));
});

test("source registry builder validates the raw audit root and has no unreachable YouTube branch", async () => {
  const builder = await readFile(new URL("../scripts/build-source-registry.mjs", import.meta.url), "utf8");
  assert.match(builder, /if \(!auditRootInput\?\.trim\(\)\)/);
  assert.doesNotMatch(builder, /youtubeChannel\s*\?/);
});
