import assert from "node:assert/strict";
import test from "node:test";
import { addPublishedDocuments, latestSicContentPerSource, latestSicPapers } from "../lib/sic-content.ts";
import type { SicContentItem } from "../lib/sic-content-types.ts";
import type { InformationItem } from "../lib/types.ts";
import { readFile } from "node:fs/promises";
import path from "node:path";

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

test("SiC keeps read diagnostics internal and renders neutral public empty states", async () => {
  const [page, snapshot, groups, rankings] = await Promise.all([
    readFile(path.join(process.cwd(), "app", "sic", "page.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "lib", "sic-public-snapshot.ts"), "utf8"),
    readFile(path.join(process.cwd(), "components", "sic-content-groups.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "components", "sic-rankings.tsx"), "utf8"),
  ]);
  assert.match(snapshot, /contentUnavailable: sicResult\.unavailable/);
  assert.match(snapshot, /documentsSupplementUnavailable: publicContent\.unavailable/);
  assert.doesNotMatch(page, /sicSnapshot\.contentUnavailable|boardsResult\.unavailable/);
  assert.doesNotMatch(groups, /固定来源读取失败|部分内容暂时无法更新|上一成功快照/);
  assert.doesNotMatch(rankings, /读取失败|更新延迟|没有把故障伪装成空榜/);
  assert.match(groups, /group\.emptyMessage/);
  assert.match(rankings, /当前平台榜单暂不可用/);
});

test("SiC papers keep every item in the current weekly snapshot", () => {
  const papers = [
    { ...item("hugging-face", "2026-07-28T08:00:00.000Z", "paper one"), group: "papers" as const, rankingWeek: "2026-W31", weeklyRank: 1 },
    { ...item("hugging-face", "2026-07-30T08:00:00.000Z", "paper two"), group: "papers" as const, rankingWeek: "2026-W31", weeklyRank: 2 },
  ];
  assert.deepEqual(latestSicPapers(papers).map((entry) => entry.title), ["paper one", "paper two"]);
});

test("published documents augment the SiC archive instead of clearing stored sources", () => {
  const storedDocument = {
    ...item("microsoft-research-blog", "2026-07-30T08:00:00.000Z", "stored archive"),
    group: "documents" as const,
  };
  const content = {
    groups: { papers: [], documents: [storedDocument], courses: [], podcasts: [] },
    state: { updatedAt: "2026-07-31T08:00:00.000Z", itemCount: 1, sourceCount: 1 },
  };

  assert.deepEqual(
    addPublishedDocuments(content, []).groups.documents.map((entry) => entry.title),
    ["stored archive"],
  );

  const publishedDocument = {
    slug: "new-archive",
    sourceName: "Google Research",
    sourceChannelId: "google-research-blog",
    contentGroup: "documents",
    sourceStream: "information",
    originalTitle: "New archive",
    translatedTitle: "新档案",
    summary: "说明",
    translatedContent: "摘要",
    originUrl: "https://research.google/blog/new-archive",
    sourceUrl: "https://research.google/blog/new-archive",
    publishedAt: "2026-07-31T09:00:00.000Z",
    discoveredAt: "2026-07-31T10:00:00.000Z",
    provenanceStatus: "verified",
  } as InformationItem;

  assert.deepEqual(
    addPublishedDocuments(content, [publishedDocument]).groups.documents.map((entry) => entry.sourceId),
    ["google-research-blog", "microsoft-research-blog"],
  );
});
