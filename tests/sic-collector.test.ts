import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ingestSicAcquisitionContent, sicCollectorTestUtils } from "../lib/sic-collector.ts";
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

test("SiC official channel collector reads YouTube media descriptions", () => {
  const channelSource: SicSource = {
    id: "test-official-channel",
    group: "courses",
    status: "approved",
    name: "Test YouTube Channel",
    publisher: "Test Publisher",
    kind: "official_channel",
    homeUrl: "https://www.youtube.com/@test",
    endpoint: "https://www.youtube.com/feeds/videos.xml?channel_id=test",
    admissionRule: "全部新视频。",
    rationale: "用于测试。",
  };
  const entries = sicCollectorTestUtils.xmlEntries(channelSource, `
    <feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
      <entry>
        <title>Official research walkthrough</title>
        <link rel="alternate" href="https://www.youtube.com/watch?v=example" />
        <published>2026-08-01T12:00:00Z</published>
        <media:group>
          <media:description><![CDATA[<p>First technical section.</p><p>Second technical section.</p>]]></media:description>
        </media:group>
      </entry>
    </feed>
  `);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].summary, "First technical section. Second technical section.");
  assert.equal(entries[0].sourceMaterial, "First technical section.\n\nSecond technical section.");
});

test("SiC bootstrap skips a newest channel entry that has no source material", () => {
  const channelSource: SicSource = {
    id: "test-official-channel",
    group: "courses",
    status: "approved",
    name: "Test YouTube Channel",
    publisher: "Test Publisher",
    kind: "official_channel",
    homeUrl: "https://www.youtube.com/@test",
    endpoint: "https://www.youtube.com/feeds/videos.xml?channel_id=test",
    admissionRule: "全部新视频。",
    rationale: "用于测试。",
  };
  const candidates = sicCollectorTestUtils.xmlEntries(channelSource, `
    <feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
      <entry>
        <title>Newest empty short</title>
        <link rel="alternate" href="https://www.youtube.com/shorts/newest" />
        <published>2026-08-02T12:00:00Z</published>
        <media:group><media:description></media:description></media:group>
      </entry>
      <entry>
        <title>Newest publishable walkthrough</title>
        <link rel="alternate" href="https://www.youtube.com/watch?v=publishable" />
        <published>2026-08-01T12:00:00Z</published>
        <media:group><media:description>Complete technical explanation.</media:description></media:group>
      </entry>
    </feed>
  `);
  const selected = sicCollectorTestUtils.selectCandidates(
    sicCollectorTestUtils.completeCandidates(candidates),
    undefined,
    "bootstrap",
  );

  assert.equal(selected.length, 1);
  assert.equal(selected[0].title, "Newest publishable walkthrough");
});

test("SiC feed collector keeps block structure in long editorial source material", () => {
  const entries = sicCollectorTestUtils.xmlEntries(rssSource, `
    <rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
      <item>
        <title>Structured feed entry</title>
        <link>https://example.com/news/structured-entry</link>
        <content:encoded><![CDATA[
          <p>First paragraph.</p>
          <p>Second paragraph.</p>
          <ul><li>First change</li><li>Second change</li></ul>
        ]]></content:encoded>
      </item>
    </channel></rss>
  `);
  assert.equal(entries.length, 1);
  assert.equal(
    entries[0].sourceMaterial,
    "First paragraph.\n\nSecond paragraph.\n\n- First change\n- Second change",
  );
  assert.equal(
    entries[0].summary,
    "First paragraph. Second paragraph. First change Second change",
  );
});

test("SiC feed collector preserves adjacent span words without spacing punctuation", () => {
  const entries = sicCollectorTestUtils.xmlEntries(rssSource, `
    <rss><channel><item>
      <title>Inline spans</title>
      <link>https://example.com/inline-spans</link>
      <description><![CDATA[<p><span>Hello</span><span>,</span> world from <span>Google</span><span>Research</span>.</p>]]></description>
    </item></channel></rss>
  `);
  assert.equal(entries[0].sourceMaterial, "Hello, world from Google Research.");
});

test("SiC acquisition keeps structured source material through domestic editorial input", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-sic-structure-"));
  const previous = {
    dataDirectory: process.env.VAULT2077_DATA_DIR,
    databaseUrl: process.env.VAULT2077_DATABASE_URL,
    fallbackDatabaseUrl: process.env.DATABASE_URL,
    baseUrl: process.env.VAULT2077_SIC_LLM_BASE_URL,
    apiKey: process.env.VAULT2077_SIC_LLM_API_KEY,
    model: process.env.VAULT2077_SIC_LLM_MODEL,
    fetch: globalThis.fetch,
  };
  process.env.VAULT2077_DATA_DIR = root;
  delete process.env.VAULT2077_DATABASE_URL;
  delete process.env.DATABASE_URL;
  process.env.VAULT2077_SIC_LLM_BASE_URL = "http://model.example/v1";
  process.env.VAULT2077_SIC_LLM_API_KEY = "test-key";
  process.env.VAULT2077_SIC_LLM_MODEL = "test-model";
  const editorialId = createHash("sha256").update("structured-material").digest("hex");
  let modelInput = "";
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    modelInput = body.messages[1].content;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        items: [{
          id: editorialId,
          translatedTitle: "结构化材料",
          description: "测试结构保真。",
          contentSummary: "材料包含两个段落和一个列表。",
        }],
      }) } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  context.after(async () => {
    if (previous.dataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous.dataDirectory;
    if (previous.databaseUrl === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previous.databaseUrl;
    if (previous.fallbackDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.fallbackDatabaseUrl;
    if (previous.baseUrl === undefined) delete process.env.VAULT2077_SIC_LLM_BASE_URL;
    else process.env.VAULT2077_SIC_LLM_BASE_URL = previous.baseUrl;
    if (previous.apiKey === undefined) delete process.env.VAULT2077_SIC_LLM_API_KEY;
    else process.env.VAULT2077_SIC_LLM_API_KEY = previous.apiKey;
    if (previous.model === undefined) delete process.env.VAULT2077_SIC_LLM_MODEL;
    else process.env.VAULT2077_SIC_LLM_MODEL = previous.model;
    globalThis.fetch = previous.fetch;
    await rm(root, { recursive: true, force: true });
  });

  const collectedAt = "2026-07-31T12:00:00.000Z";
  await ingestSicAcquisitionContent({
    version: 1,
    snapshotId: "snapshot:structured-material",
    collectedAt,
    items: [{
      id: "structured-material",
      sourceId: "google-research-blog",
      group: "documents",
      sourceName: "Google Research Blog",
      publisher: "Google Research",
      title: "Structured material",
      summary: "First paragraph. Second paragraph.",
      sourceMaterial: "First paragraph.\n\nSecond paragraph.\n\n- First change\n- Second change",
      url: "https://research.google/blog/structured-material/",
      publishedAt: collectedAt,
      collectedAt,
      canonicalId: "structured-material",
      provenanceStatus: "declared",
    }],
    reports: [{
      sourceId: "google-research-blog",
      status: "success",
      collectedAt,
      itemCount: 1,
    }],
  }, globalThis.fetch);

  const untrustedInput = modelInput.split("不可信原始资料：\n").at(-1);
  assert.ok(untrustedInput);
  const editorialInput = JSON.parse(untrustedInput) as Array<{ sourceMaterial: string }>;
  assert.equal(
    editorialInput[0].sourceMaterial,
    "First paragraph.\n\nSecond paragraph.\n\n- First change\n- Second change",
  );
});

test("SiC model infrastructure failures escape source degradation so the inbox can retry", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-sic-provider-failure-"));
  const previous = {
    dataDirectory: process.env.VAULT2077_DATA_DIR,
    databaseUrl: process.env.VAULT2077_DATABASE_URL,
    fallbackDatabaseUrl: process.env.DATABASE_URL,
    baseUrl: process.env.VAULT2077_SIC_LLM_BASE_URL,
    apiKey: process.env.VAULT2077_SIC_LLM_API_KEY,
    model: process.env.VAULT2077_SIC_LLM_MODEL,
    fetch: globalThis.fetch,
  };
  process.env.VAULT2077_DATA_DIR = root;
  delete process.env.VAULT2077_DATABASE_URL;
  delete process.env.DATABASE_URL;
  process.env.VAULT2077_SIC_LLM_BASE_URL = "http://unavailable-model.example/v1";
  process.env.VAULT2077_SIC_LLM_API_KEY = "test-key";
  process.env.VAULT2077_SIC_LLM_MODEL = "test-model";
  globalThis.fetch = async () => {
    throw new Error("fetch failed");
  };
  context.after(async () => {
    if (previous.dataDirectory === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous.dataDirectory;
    if (previous.databaseUrl === undefined) delete process.env.VAULT2077_DATABASE_URL;
    else process.env.VAULT2077_DATABASE_URL = previous.databaseUrl;
    if (previous.fallbackDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.fallbackDatabaseUrl;
    if (previous.baseUrl === undefined) delete process.env.VAULT2077_SIC_LLM_BASE_URL;
    else process.env.VAULT2077_SIC_LLM_BASE_URL = previous.baseUrl;
    if (previous.apiKey === undefined) delete process.env.VAULT2077_SIC_LLM_API_KEY;
    else process.env.VAULT2077_SIC_LLM_API_KEY = previous.apiKey;
    if (previous.model === undefined) delete process.env.VAULT2077_SIC_LLM_MODEL;
    else process.env.VAULT2077_SIC_LLM_MODEL = previous.model;
    globalThis.fetch = previous.fetch;
    await rm(root, { recursive: true, force: true });
  });

  const collectedAt = "2026-08-02T00:00:00.000Z";
  await assert.rejects(
    ingestSicAcquisitionContent({
      version: 1,
      snapshotId: "snapshot:provider-failure",
      collectedAt,
      items: [{
        id: "provider-failure",
        sourceId: "google-research-blog",
        group: "documents",
        sourceName: "Google Research Blog",
        publisher: "Google Research",
        title: "Provider failure fixture",
        summary: "Provider failure fixture.",
        sourceMaterial: "Provider failure fixture.",
        url: "https://research.google/blog/provider-failure-fixture/",
        publishedAt: collectedAt,
        collectedAt,
        canonicalId: "provider-failure",
        provenanceStatus: "declared",
      }],
      reports: [{
        sourceId: "google-research-blog",
        status: "success",
        collectedAt,
        itemCount: 1,
      }],
    }, globalThis.fetch),
    /境内 LLM 请求失败：fetch failed/,
  );
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
      <url><loc>https://example.com/news</loc><lastmod>2026-07-20</lastmod></url>
      <url><loc>https://example.com/about</loc><lastmod>2026-07-20</lastmod></url>
      <url><loc>https://untrusted.example/news/other</loc><lastmod>2026-07-20</lastmod></url>
    </urlset>
  `);
  assert.deepEqual(entries.map((entry) => entry.url), ["https://example.com/news/official-update"]);
});

test("Follow Builders blog feed keeps upstream publishers and decodes HTML entities", () => {
  const source: SicSource = {
    ...rssSource,
    id: "follow-builders-blogs",
    group: "documents",
    kind: "trusted_feed_json",
    homeUrl: "https://github.com/zarazhangrui/follow-builders",
    endpoint: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-blogs.json",
  };
  const entries = sicCollectorTestUtils.followBuildersJsonEntries(source, JSON.stringify({
    generatedAt: "2026-08-02T00:00:00Z",
    lookbackHours: 72,
    blogs: [{
      source: "claude-blog",
      name: "Claude Blog",
      title: "Hiring: Part Time Instructor",
      url: "https://claude.com/blog/hiring-part-time-instructor",
      author: "Claude Team",
      publishedAt: "2026-08-01T00:00:00Z",
      description: "",
      content: "We&#8217;re hiring an instructor to teach production code.",
    }, {
      source: "claude-blog",
      name: "Claude Blog",
      title: "Engineering reliable agents",
      url: "https://claude.com/blog/engineering-reliable-agents",
      publishedAt: "2026-08-02T00:00:00Z",
      description: "A second item from the same upstream publisher.",
      content: "A distinct article selected by Follow Builders.",
    }],
  }));

  assert.equal(entries.length, 2);
  assert.equal(entries[0].sourceName, "Claude Blog");
  assert.equal(entries[0].publisher, "Claude Blog");
  assert.equal(entries[0].summary, "We’re hiring an instructor to teach production code.");
  assert.match(entries[0].sourceMaterial ?? "", /We’re hiring an instructor/);
  assert.notEqual(entries[0].canonicalId, entries[1].canonicalId);
});

test("Follow Builders podcast feed keeps the supplied transcript without local source admission", () => {
  const source: SicSource = {
    ...rssSource,
    id: "follow-builders-podcasts",
    group: "podcasts",
    kind: "trusted_feed_json",
    homeUrl: "https://github.com/zarazhangrui/follow-builders",
    endpoint: "https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-podcasts.json",
  };
  const entries = sicCollectorTestUtils.followBuildersJsonEntries(source, JSON.stringify({
    generatedAt: "2026-08-02T00:00:00Z",
    lookbackHours: 336,
    podcasts: [{
      source: "new-upstream-show",
      name: "A newly selected show",
      title: "Episode one",
      guid: "episode-one",
      url: "https://podcasts.example/episode-one",
      publishedAt: "2026-08-01T00:00:00Z",
      transcript: "A complete transcript selected by Follow Builders.",
    }],
  }));

  assert.equal(entries.length, 1);
  assert.equal(entries[0].canonicalId, "follow-builders-podcast:episode-one");
  assert.equal(entries[0].sourceName, "A newly selected show");
  assert.equal(entries[0].sourceMaterial, "A complete transcript selected by Follow Builders.");
});

test("SiC source admission rejects configured marketing announcements", () => {
  const source: SicSource = {
    ...rssSource,
    id: "claude-blog",
    kind: "official_sitemap",
    excludedTitlePatterns: [
      "^(introducing|announcing)\\b",
      "\\b(now available|launch(?:es|ed|ing)?|pricing|promotion|partnership)\\b",
    ],
  };

  assert.equal(
    sicCollectorTestUtils.candidatePassesAdmission(source, {
      title: "Introducing Claude Enterprise",
    }),
    false,
  );
  assert.equal(
    sicCollectorTestUtils.candidatePassesAdmission(source, {
      title: "Building reliable agents with long-running context",
    }),
    true,
  );
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

test("SiC dated-index collector keeps structured material for domestic editorial", () => {
  const source: SicSource = {
    ...rssSource,
    id: "release-notes",
    kind: "official_dated_index",
    homeUrl: "https://example.com/releases",
    endpoint: "https://example.com/releases",
  };
  const entries = sicCollectorTestUtils.datedIndexEntries(source, `
    <h2>July 22, 2026</h2>
    <p>First paragraph.</p>
    <p>Second paragraph.</p>
    <ul><li>First change</li><li>Second change</li></ul>
  `);
  assert.equal(
    entries[0].sourceMaterial,
    "First paragraph.\n\nSecond paragraph.\n\n- First change\n- Second change",
  );
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
        <summary>First abstract paragraph.

Second abstract paragraph.</summary>
        <published>2026-07-22T00:00:00Z</published>
      </entry>
    </feed>
  `, discoveries);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].canonicalId, "arxiv:2607.12345");
  assert.equal(entries[0].url, "https://arxiv.org/abs/2607.12345");
  assert.equal(entries[0].discoveryUrl, "https://huggingface.co/papers/2607.12345");
  assert.equal(entries[0].title, "Verified Frontier Paper");
  assert.equal(entries[0].summary, "First abstract paragraph. Second abstract paragraph.");
  assert.equal(entries[0].sourceMaterial, "First abstract paragraph.\n\nSecond abstract paragraph.");
  assert.equal(entries[0].rankingWeek, "2026-W31");
  assert.equal(entries[0].weeklyRank, 3);
  assert.equal(entries[0].weeklyUpvotes, 42);
});

test("Hugging Face paper verification falls back between both approved arXiv API origins", async () => {
  const source: SicSource = {
    ...rssSource,
    id: "hugging-face-daily-papers",
    group: "papers",
    kind: "official_api",
    homeUrl: "https://huggingface.co/papers",
    endpoint: "https://huggingface.co/api/daily_papers",
    allowedRedirectOrigins: ["https://arxiv.org", "https://export.arxiv.org"],
  };
  const discoveries = new Map([["2607.12345", {
    id: "2607.12345",
    discoveryUrl: "https://huggingface.co/papers/2607.12345",
    upvotes: 42,
    rankingWeek: "2026-W31",
    weeklyRank: 1,
  }]]);
  const requested: string[] = [];
  const entries = await sicCollectorTestUtils.collectArxivBatch(
    source,
    async (url) => {
      requested.push(url);
      if (url.startsWith("https://export.arxiv.org")) throw new Error("temporary timeout");
      return new Response(`
        <feed><entry>
          <id>http://arxiv.org/abs/2607.12345v1</id>
          <title>Verified Paper</title>
          <summary>Verified abstract.</summary>
          <published>2026-07-22T00:00:00Z</published>
        </entry></feed>
      `, { status: 200 });
    },
    ["2607.12345"],
    discoveries,
  );
  assert.deepEqual(requested.map((url) => new URL(url).origin), [
    "https://export.arxiv.org",
    "https://arxiv.org",
  ]);
  assert.equal(entries[0].canonicalId, "arxiv:2607.12345");
});
