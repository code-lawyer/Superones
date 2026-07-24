import assert from "node:assert/strict";
import test from "node:test";
import { sicCollectorTestUtils } from "../lib/sic-collector.ts";
import type { SicSource } from "../lib/sic-source-registry.ts";

const rssSource: SicSource = {
  id: "test-feed",
  group: "archive",
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

test("SiC dated-index collector keeps the newest dated release instead of navigation links", () => {
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
  assert.equal(entries.length, 1);
  assert.equal(entries[0].publishedAt, "2026-07-22T00:00:00.000Z");
  assert.match(entries[0].title, /managed agent capability/i);
});

test("SiC official-index anchors admit paper entries but reject site navigation", () => {
  const source: SicSource = {
    ...rssSource,
    id: "hugging-face-daily-papers",
    group: "papers",
    kind: "official_index",
    homeUrl: "https://huggingface.co/papers",
    endpoint: "https://huggingface.co/papers",
  };
  const entries = sicCollectorTestUtils.anchorEntries(source, `
    <a href="/models">Models</a>
    <a href="/papers/2607.12345">A New Verifier for Long-Horizon Reasoning</a>
  `);
  assert.deepEqual(entries.map((entry) => entry.url), ["https://huggingface.co/papers/2607.12345"]);
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
