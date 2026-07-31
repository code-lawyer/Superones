import assert from "node:assert/strict";
import test from "node:test";
import { sicCollectorTestUtils } from "../lib/sic-collector.ts";
import type { SicSource } from "../lib/sic-source-registry.ts";

const rssSource: SicSource = {
  id: "test-feed",
  group: "documents",
  status: "approved",
  name: "Test Feed",
  publisher: "Test Publisher",
  kind: "official_rss",
  homeUrl: "https://example.com/news/",
  endpoint: "https://example.com/news/feed.xml",
  admissionRule: "全部文章。",
  rationale: "用于测试。",
};

test("SiC feed collector preserves every fixed-source entry and rejects foreign links", () => {
  const entries = sicCollectorTestUtils.xmlEntries(rssSource, `
    <rss><channel>
      <item><title>First technical release</title><link>https://example.com/news/first</link><description>Primary details</description><pubDate>Tue, 21 Jul 2026 10:00:00 GMT</pubDate></item>
      <item><title>Outside link</title><link>https://untrusted.example/entry</link><description>Must not enter</description></item>
    </channel></rss>
  `);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, "First technical release");
  assert.equal(entries[0].url, "https://example.com/news/first");
  assert.equal(entries[0].publishedAt, "2026-07-21T10:00:00.000Z");
  assert.equal(entries[0].sourceMaterial, "Primary details");
});

test("SiC feed collector uses feed content without requiring article-page fetches", () => {
  const entries = sicCollectorTestUtils.xmlEntries(rssSource, `
    <rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
      <item>
        <title>Full feed entry</title>
        <link>https://example.com/news/full-entry</link>
        <description>Short description</description>
        <content:encoded><![CDATA[<p>Complete structured feed material.</p>]]></content:encoded>
        <pubDate>Tue, 21 Jul 2026 10:00:00 GMT</pubDate>
      </item>
    </channel></rss>
  `);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].summary, "Complete structured feed material.");
  assert.equal(entries[0].sourceMaterial, "Complete structured feed material.");
});

test("bootstrap selection keeps the newest real item even outside the daily window", () => {
  const candidates = sicCollectorTestUtils.xmlEntries(rssSource, `
    <rss><channel>
      <item><title>Older episode</title><link>https://example.com/news/older</link><pubDate>Tue, 02 Jun 2026 10:00:00 GMT</pubDate></item>
      <item><title>Latest episode</title><link>https://example.com/news/latest</link><pubDate>Tue, 09 Jun 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>
  `);
  const selected = sicCollectorTestUtils.selectCandidates(candidates, undefined, "bootstrap");
  assert.deepEqual(selected.map((item) => item.title), ["Latest episode"]);
});

test("SiC sitemap collector stays inside the approved publication path", () => {
  const entries = sicCollectorTestUtils.sitemapUrls(rssSource, `
    <urlset>
      <url><loc>https://example.com/news/official-update</loc><lastmod>2026-07-20</lastmod></url>
      <url><loc>https://example.com/about</loc><lastmod>2026-07-20</lastmod></url>
      <url><loc>https://untrusted.example/news/other</loc><lastmod>2026-07-20</lastmod></url>
    </urlset>
  `);
  assert.deepEqual(entries.map((entry) => entry.url), ["https://example.com/news/official-update"]);
});

test("SiC dated-index collector accepts structured official entries", () => {
  const entries = sicCollectorTestUtils.jsonLdEntries(rssSource, `
    <script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","headline":"Release notes","url":"https://example.com/news/release-notes","description":"New API capability","datePublished":"2026-07-19"}]}</script>
  `);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].summary, "New API capability");
});

test("SiC dated-index collector keeps every dated release instead of navigation links", () => {
  const source: SicSource = {
    ...rssSource,
    id: "release-notes",
    kind: "official_dated_index",
    homeUrl: "https://example.com/releases",
    endpoint: "https://example.com/releases",
  };
  const entries = sicCollectorTestUtils.datedIndexEntries(source, `
    <nav><a href="/products">Products</a><a href="/research">Research</a></nav>
    <h2>July 20, 2026</h2><ul><li>Older model update.</li></ul>
    <h2>July 22, 2026</h2><ul><li>New managed agent capability is available.</li></ul>
  `);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].publishedAt, "2026-07-22T00:00:00.000Z");
  assert.match(entries[0].title, /managed agent capability/i);
  assert.equal(entries[1].publishedAt, "2026-07-20T00:00:00.000Z");
  assert.match(entries[1].title, /older model update/i);
});

test("Hugging Face weekly collection uses the official API with an ISO week", () => {
  const source: SicSource = {
    ...rssSource,
    id: "hugging-face-daily-papers",
    group: "papers",
    kind: "official_api",
    homeUrl: "https://huggingface.co/papers",
    endpoint: "https://huggingface.co/api/daily_papers?limit=100&p=0&sort=publishedAt",
  };
  const endpoint = new URL(sicCollectorTestUtils.huggingFaceWeeklyEndpoint(source, "2026-07-31T08:00:00.000Z"));
  assert.equal(endpoint.origin + endpoint.pathname, "https://huggingface.co/api/daily_papers");
  assert.equal(endpoint.searchParams.get("week"), "2026-W31");
  assert.equal(endpoint.searchParams.get("sort"), "publishedAt");
  assert.equal(endpoint.searchParams.get("limit"), "100");
});

test("ISO week calculation observes week-year boundaries", () => {
  assert.equal(sicCollectorTestUtils.isoWeek("2027-01-01T12:00:00.000Z"), "2026-W53");
  assert.equal(sicCollectorTestUtils.isoWeek("2027-01-04T12:00:00.000Z"), "2027-W01");
});

test("SiC podcast admission can require an audio enclosure", () => {
  const source: SicSource = {
    ...rssSource,
    id: "latent-space-podcast",
    group: "podcasts",
    kind: "hosted_podcast",
    homeUrl: "https://www.latent.space/",
    endpoint: "https://www.latent.space/feed",
  };
  const entries = sicCollectorTestUtils.xmlEntries(source, `
    <rss><channel>
      <item><title>Newsletter only</title><link>https://www.latent.space/p/newsletter</link></item>
      <item><title>Podcast episode</title><link>https://www.latent.space/p/podcast</link><enclosure url="https://cdn.example.com/episode.mp3" type="audio/mpeg" /></item>
    </channel></rss>
  `);
  assert.deepEqual(entries.map((entry) => entry.title), ["Podcast episode"]);
});

test("SiC source may explicitly approve a canonical redirect origin", () => {
  const source: SicSource = {
    ...rssSource,
    id: "redirected-docs",
    kind: "official_dated_index",
    allowedRedirectOrigins: ["https://platform.example.com"],
  };
  const entries = sicCollectorTestUtils.jsonLdEntries(source, `
    <script type="application/ld+json">{"headline":"Release notes","url":"https://platform.example.com/releases","datePublished":"2026-07-22"}</script>
  `);
  assert.equal(entries[0].url, "https://platform.example.com/releases");
});

test("Hugging Face paper discovery is normalized to arXiv identifiers", () => {
  const records = sicCollectorTestUtils.huggingFacePaperRecords(JSON.stringify([
    { paper: { id: "2607.12345", title: "Discovery title" }, upvotes: 42 },
    { id: "https://arxiv.org/abs/2607.54321v2" },
    { id: "not-an-arxiv-id" },
  ]));
  assert.deepEqual(records, [
    { id: "2607.12345", discoveryUrl: "https://huggingface.co/papers/2607.12345", upvotes: 42 },
    { id: "2607.54321", discoveryUrl: "https://huggingface.co/papers/2607.54321", upvotes: 0 },
  ]);
});

test("Hugging Face weekly papers are ranked locally by upvotes with stable tie breakers", () => {
  const ranked = sicCollectorTestUtils.rankHuggingFacePaperRecords([
    { id: "2607.00003", discoveryUrl: "https://huggingface.co/papers/2607.00003", submittedAt: "2026-07-30T08:00:00.000Z", upvotes: 12 },
    { id: "2607.00001", discoveryUrl: "https://huggingface.co/papers/2607.00001", submittedAt: "2026-07-29T08:00:00.000Z", upvotes: 40 },
    { id: "2607.00002", discoveryUrl: "https://huggingface.co/papers/2607.00002", submittedAt: "2026-07-30T08:00:00.000Z", upvotes: 40 },
  ], "2026-W31");
  assert.deepEqual(ranked.map((item) => ({ id: item.id, rank: item.weeklyRank, upvotes: item.upvotes })), [
    { id: "2607.00002", rank: 1, upvotes: 40 },
    { id: "2607.00001", rank: 2, upvotes: 40 },
    { id: "2607.00003", rank: 3, upvotes: 12 },
  ]);
});

test("arXiv metadata replaces discovery metadata while preserving the weekly rank", () => {
  const discoveries = new Map([["2607.12345", {
    id: "2607.12345",
    discoveryUrl: "https://huggingface.co/papers/2607.12345",
    upvotes: 42,
    rankingWeek: "2026-W31",
    weeklyRank: 3,
  }]]);
  const entries = sicCollectorTestUtils.arxivEntries(`
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>http://arxiv.org/abs/2607.12345v2</id>
        <title>Verified Frontier Paper</title>
        <summary>Verified abstract from arXiv.</summary>
        <published>2026-07-22T00:00:00Z</published>
      </entry>
    </feed>
  `, discoveries);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].canonicalId, "arxiv:2607.12345");
  assert.equal(entries[0].url, "https://arxiv.org/abs/2607.12345");
  assert.equal(entries[0].discoveryUrl, "https://huggingface.co/papers/2607.12345");
  assert.equal(entries[0].title, "Verified Frontier Paper");
  assert.equal(entries[0].rankingWeek, "2026-W31");
  assert.equal(entries[0].weeklyRank, 3);
  assert.equal(entries[0].weeklyUpvotes, 42);
});
