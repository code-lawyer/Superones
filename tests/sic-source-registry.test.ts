import assert from "node:assert/strict";
import test from "node:test";
import { listApprovedSicSources, listCollectableSicSources, listSicSources } from "../lib/sic-source-registry.ts";

test("SiC source registry contains the approved fixed source catalog", () => {
  const sources = listSicSources();
  assert.equal(sources.length, 40);
  assert.equal(sources.filter((source) => source.group === "papers").length, 2);
  assert.equal(sources.filter((source) => source.group === "documents").length, 19);
  assert.equal(sources.filter((source) => source.group === "courses").length, 8);
  assert.equal(sources.filter((source) => source.group === "podcasts").length, 11);
  assert.equal(listApprovedSicSources().length, 19);
  assert.equal(listCollectableSicSources().length, 19);
  assert.equal(sources.filter((source) => source.status === "retired").length, 19);
  assert.equal(sources.filter((source) => source.status === "paused").length, 1);
  assert.equal(sources.filter((source) => source.status === "pending_review").length, 1);
  assert.ok(sources.find((source) => source.id === "dair-ai-papers-of-the-week")?.statusReason);
  assert.ok(listCollectableSicSources().every((source) => (
    ["official_rss", "official_atom", "official_sitemap", "official_api", "official_channel", "hosted_podcast", "trusted_feed_json"].includes(source.kind)
  )));
  assert.ok([
    "anthropic-engineering",
    "claude-blog",
    "latent-space-podcast",
    "no-priors-podcast",
    "training-data-podcast",
    "unsupervised-learning-podcast",
    "mad-podcast-matt-turck",
    "ai-and-i-every-podcast",
  ].every((id) => sources.find((source) => source.id === id)?.failureMode === "isolated"));
  assert.ok((sources.find((source) => source.id === "claude-blog")?.excludedTitlePatterns?.length ?? 0) > 0);
  assert.equal(sources.find((source) => source.id === "follow-builders-blogs")?.status, "paused");
  assert.ok(sources.find((source) => source.id === "follow-builders-blogs")?.statusReason);
  assert.equal(sources.find((source) => source.id === "follow-builders-podcasts")?.status, "approved");
  assert.equal(
    sources.find((source) => source.id === "microsoft-research-video")?.endpoint,
    "https://www.youtube.com/feeds/videos.xml?channel_id=UCCb9_Kn8F_Opb3UCGm-lILQ",
  );
  assert.equal(
    sources.find((source) => source.id === "stanford-hai-video")?.endpoint,
    "https://www.youtube.com/feeds/videos.xml?channel_id=UChugFTK0KyrES9terTid8vA",
  );
  assert.equal(
    sources.find((source) => source.id === "mit-csail-video")?.endpoint,
    "https://www.youtube.com/feeds/videos.xml?channel_id=UCBpxspUNl1Th33XbugiHJzw",
  );
  assert.ok(sources.every((source) => source.rationale.length > 0));
  assert.ok(sources.every((source) => source.endpoint.startsWith("https://")));
});
