import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsMap.set(process.argv[index], process.argv[index + 1]);
}

const auditRoot = resolve(argumentsMap.get("--audit-root") ?? process.env.VAULT2077_SOURCE_AUDIT_ROOT ?? "");
if (!auditRoot) throw new Error("Pass --audit-root or VAULT2077_SOURCE_AUDIT_ROOT.");

const outputPath = resolve(argumentsMap.get("--output") ?? "config/source-registry.json");
const csvPath = resolve(argumentsMap.get("--csv") ?? "docs/Vault2077-Source-Registry.csv");
const generatedAt = new Date().toISOString();

const repositoryDefinitions = [
  ["TrendRadar", "sansan0/TrendRadar", "https://github.com/sansan0/TrendRadar"],
  ["Horizon", "Thysrael/Horizon", "https://github.com/Thysrael/Horizon"],
  ["follow-builders", "zarazhangrui/follow-builders", "https://github.com/zarazhangrui/follow-builders"],
  ["BestBlogs", "ginobefun/BestBlogs", "https://github.com/ginobefun/BestBlogs"],
  ["CloudFlare-AI-Insight-Daily", "justlovemaki/CloudFlare-AI-Insight-Daily", "https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily"],
  ["PrismFlowAgent", "justlovemaki/PrismFlowAgent", "https://github.com/justlovemaki/PrismFlowAgent"],
  ["glance", "glanceapp/glance", "https://github.com/glanceapp/glance"],
];

const repositoryPaths = new Map(repositoryDefinitions.map(([directory]) => [directory, join(auditRoot, directory)]));
const repositories = repositoryDefinitions.map(([directory, name, url]) => ({
  directory,
  name,
  url,
  commit: git(directory, ["rev-parse", "HEAD"]).trim(),
}));

const channelsByIdentity = new Map();
const unresolved = [];
const excludedSourceChannelTypes = new Set(["youtube"]);

function git(directory, args) {
  const cwd = repositoryPaths.get(directory);
  return execFileSync("git", ["-c", `safe.directory=${cwd.replaceAll("\\", "/")}`, "-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

function gitShow(directory, file) {
  return git(directory, ["show", `HEAD:${file}`]);
}

function evidence(repository, path, upstreamValue) {
  return { repository, path, ...(upstreamValue ? { upstreamValue } : {}) };
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value.trim().toLowerCase();
  }
}

function nonVideoHomeUrl(value, fallback) {
  if (!value) return fallback;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be" ? fallback : value;
  } catch {
    return fallback;
  }
}

function endpointKey(endpoint) {
  return `${endpoint.connectorType}:${normalizeUrl(endpoint.url)}`;
}

function addChannel(candidate) {
  if (excludedSourceChannelTypes.has(candidate.channelType)) return;
  const identity = candidate.identity;
  const existing = channelsByIdentity.get(identity);
  if (!existing) {
    channelsByIdentity.set(identity, {
      id: `source-${hash(identity)}`,
      identity,
      publisherName: candidate.publisherName,
      publisherRole: candidate.publisherRole ?? "媒体",
      channelType: candidate.channelType,
      channelIdentifier: candidate.channelIdentifier,
      homeUrl: candidate.homeUrl,
      language: candidate.language ?? "unknown",
      contentCapability: candidate.contentCapability ?? "metadata",
      evidenceEligible: candidate.evidenceEligible ?? true,
      enabled: false,
      endpoints: candidate.endpoint ? [candidate.endpoint] : [],
      discoveredFrom: [candidate.discoveredFrom],
      validation: { status: "not_checked", checkedAt: null },
    });
    return;
  }

  if (!existing.homeUrl && candidate.homeUrl) existing.homeUrl = candidate.homeUrl;
  if (existing.publisherRole === "媒体" && candidate.publisherRole && candidate.publisherRole !== "媒体") {
    existing.publisherRole = candidate.publisherRole;
  }
  if (candidate.contentCapability === "transcript" || candidate.contentCapability === "fulltext") {
    existing.contentCapability = candidate.contentCapability;
  }
  const discoveredKey = `${candidate.discoveredFrom.repository}:${candidate.discoveredFrom.path}:${candidate.discoveredFrom.upstreamValue ?? ""}`;
  if (!existing.discoveredFrom.some((item) => `${item.repository}:${item.path}:${item.upstreamValue ?? ""}` === discoveredKey)) {
    existing.discoveredFrom.push(candidate.discoveredFrom);
  }
  if (candidate.endpoint && !existing.endpoints.some((item) => endpointKey(item) === endpointKey(candidate.endpoint))) {
    existing.endpoints.push(candidate.endpoint);
  }
}

function addUnresolved(item) {
  unresolved.push({ id: `unresolved-${hash(JSON.stringify(item))}`, ...item });
}

function xmlDecode(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function parseOpml(xml) {
  return [...xml.matchAll(/<outline\b([^>]*\bxmlUrl="[^"]+"[^>]*)\/?\s*>/g)].map((match) => {
    const attributes = Object.fromEntries([...match[1].matchAll(/([\w]+)="([^"]*)"/g)].map((item) => [item[1], xmlDecode(item[2])]));
    return { title: attributes.title || attributes.text || "Unknown", xmlUrl: attributes.xmlUrl, htmlUrl: attributes.htmlUrl };
  });
}

function rssCandidate({ title, url, family, repository, path, publisherRole = "媒体", homeUrl, capability }) {
  const parsed = new URL(url);
  const xHandle = family === "x" ? title.match(/\(@([^\)]+)\)/)?.[1] : null;
  const youtubeChannel = parsed.hostname.includes("youtube.com") ? parsed.searchParams.get("channel_id") : null;
  if (youtubeChannel) return;
  const identity = xHandle
    ? `x:${xHandle.toLowerCase()}`
    : youtubeChannel
      ? `youtube:${youtubeChannel}`
      : `feed:${normalizeUrl(url)}`;
  const proxyHosts = new Set(["api.xgo.ing", "rsshub.bestblogs.dev", "wechat2rss.bestblogs.dev", "pod2txt.vercel.app"]);
  addChannel({
    identity,
    publisherName: title.replace(/\(@[^\)]+\)$/, "").trim(),
    publisherRole: xHandle ? "评论" : publisherRole,
    channelType: xHandle ? "x" : youtubeChannel ? "youtube" : family,
    channelIdentifier: xHandle ?? youtubeChannel ?? normalizeUrl(url),
    homeUrl: xHandle ? `https://x.com/${xHandle}` : nonVideoHomeUrl(homeUrl, url),
    contentCapability: capability ?? (xHandle ? "excerpt" : youtubeChannel ? "metadata" : "feed-content"),
    endpoint: {
      url,
      connectorType: "rss",
      aggregator: proxyHosts.has(parsed.hostname.toLowerCase()) ? parsed.hostname.toLowerCase() : null,
      requiresAuth: false,
      validation: { status: "not_checked", checkedAt: null },
    },
    discoveredFrom: evidence(repository, path, url),
  });
}

// BestBlogs: video channels are deliberately excluded because Vault2077 does not process video media.
for (const [file, family] of [
  ["BestBlogs_RSS_Articles.opml", "article"],
  ["BestBlogs_RSS_Podcasts.opml", "podcast"],
  ["BestBlogs_RSS_Twitters.opml", "x"],
]) {
  for (const item of parseOpml(gitShow("BestBlogs", file))) {
    rssCandidate({ title: item.title, url: item.xmlUrl, family, repository: "ginobefun/BestBlogs", path: file, homeUrl: item.htmlUrl });
  }
}

// TrendRadar: concrete NewsNow hot-list IDs and RSS feeds from the distributed English config.
const trendConfig = await readFile(join(repositoryPaths.get("TrendRadar"), "config/config.en.yaml"), "utf8");
const platformBlock = trendConfig.slice(trendConfig.indexOf("platforms:"), trendConfig.indexOf("\nrss:"));
for (const match of platformBlock.matchAll(/- id: "([^"]+)"\s+name: "([^"]+)"\s+expected_domain: "([^"]+)"/g)) {
  const [, id, name, expectedDomain] = match;
  addChannel({
    identity: `newsnow:${id}`,
    publisherName: name,
    channelType: "hotlist",
    channelIdentifier: id,
    homeUrl: `https://${expectedDomain}`,
    contentCapability: "metadata",
    evidenceEligible: false,
    endpoint: {
      url: `https://newsnow.busiyi.world/api/s?id=${encodeURIComponent(id)}&latest`,
      connectorType: "newsnow",
      aggregator: "newsnow.busiyi.world",
      requiresAuth: false,
      expectedDomain,
      validation: { status: "not_checked", checkedAt: null },
    },
    discoveredFrom: evidence("sansan0/TrendRadar", "config/config.en.yaml", id),
  });
}
const trendRssBlock = trendConfig.slice(trendConfig.indexOf("\nrss:") + 1, trendConfig.indexOf("\nreport:"));
for (const match of trendRssBlock.matchAll(/- id: "([^"]+)"\s+name: "([^"]+)"\s+url: "([^"]+)"([\s\S]*?)(?=\n\s+- id:|$)/g)) {
  const [, , name, url, tail] = match;
  if (/enabled:\s+false/.test(tail)) continue;
  rssCandidate({ title: name, url, family: "article", repository: "sansan0/TrendRadar", path: "config/config.en.yaml" });
}

// Horizon: every concrete item in config.example.json, including disabled examples.
const horizon = JSON.parse(await readFile(join(repositoryPaths.get("Horizon"), "data/config.example.json"), "utf8"));
for (const item of horizon.sources.github ?? []) {
  const isRelease = item.type === "repo_releases";
  const identifier = isRelease ? `${item.owner}/${item.repo}` : item.username;
  const url = isRelease
    ? `https://api.github.com/repos/${identifier}/releases?per_page=10`
    : `https://api.github.com/users/${identifier}/events/public?per_page=30`;
  addChannel({
    identity: `${isRelease ? "github-release" : "github-user"}:${identifier.toLowerCase()}`,
    publisherName: identifier,
    publisherRole: isRelease ? "官方" : "评论",
    channelType: isRelease ? "github-release" : "github-user-events",
    channelIdentifier: identifier,
    homeUrl: `https://github.com/${identifier}`,
    contentCapability: isRelease ? "fulltext" : "metadata",
    endpoint: { url, connectorType: isRelease ? "github-releases" : "github-user-events", aggregator: null, requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
    discoveredFrom: evidence("Thysrael/Horizon", "data/config.example.json", identifier),
  });
}
if (horizon.sources.hackernews) {
  addChannel({
    identity: "community:hacker-news",
    publisherName: "Hacker News",
    publisherRole: "评论",
    channelType: "community",
    channelIdentifier: "hacker-news",
    homeUrl: "https://news.ycombinator.com/",
    contentCapability: "metadata",
    endpoint: { url: "https://hacker-news.firebaseio.com/v0/topstories.json", connectorType: "hackernews", aggregator: null, requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
    discoveredFrom: evidence("Thysrael/Horizon", "data/config.example.json", "hackernews"),
  });
}
for (const item of horizon.sources.rss ?? []) {
  if (item.url.includes("${")) {
    addUnresolved({ repository: "Thysrael/Horizon", path: "data/config.example.json", kind: "credentialized_feed", publisherName: item.name, identifier: item.url, reason: "Feed requires a subscriber key and cannot be tested without authorization." });
  } else {
    rssCandidate({ title: item.name, url: item.url, family: "article", repository: "Thysrael/Horizon", path: "data/config.example.json" });
  }
}
for (const item of horizon.sources.reddit?.subreddits ?? []) {
  const name = item.subreddit;
  addChannel({
    identity: `reddit:subreddit:${name.toLowerCase()}`,
    publisherName: `r/${name}`,
    publisherRole: "评论",
    channelType: "reddit",
    channelIdentifier: `r/${name}`,
    homeUrl: `https://www.reddit.com/r/${name}/`,
    endpoint: { url: `https://www.reddit.com/r/${name}/${item.sort ?? "hot"}.json?limit=${item.fetch_limit ?? 25}`, connectorType: "reddit", aggregator: null, requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
    discoveredFrom: evidence("Thysrael/Horizon", "data/config.example.json", `r/${name}`),
  });
}
for (const item of horizon.sources.reddit?.users ?? []) {
  const name = item.username;
  addChannel({
    identity: `reddit:user:${name.toLowerCase()}`,
    publisherName: `u/${name}`,
    publisherRole: "评论",
    channelType: "reddit",
    channelIdentifier: `u/${name}`,
    homeUrl: `https://www.reddit.com/user/${name}/`,
    endpoint: { url: `https://www.reddit.com/user/${name}/submitted.json?limit=${item.fetch_limit ?? 25}`, connectorType: "reddit", aggregator: null, requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
    discoveredFrom: evidence("Thysrael/Horizon", "data/config.example.json", `u/${name}`),
  });
}
for (const handle of horizon.sources.twitter?.users ?? []) {
  addChannel({
    identity: `x:${handle.toLowerCase()}`,
    publisherName: handle,
    publisherRole: "评论",
    channelType: "x",
    channelIdentifier: handle,
    homeUrl: `https://x.com/${handle}`,
    contentCapability: "excerpt",
    endpoint: { url: `https://x.com/${handle}`, connectorType: "x-api", aggregator: null, requiresAuth: true, validation: { status: "auth_required", checkedAt: null } },
    discoveredFrom: evidence("Thysrael/Horizon", "data/config.example.json", handle),
  });
}
for (const watchlist of horizon.sources.openbb?.watchlists ?? []) {
  for (const symbol of watchlist.symbols ?? []) {
    addChannel({
      identity: `market:${symbol.toLowerCase()}`,
      publisherName: symbol,
      publisherRole: "研究",
      channelType: "market-data",
      channelIdentifier: symbol,
      contentCapability: "structured-data",
      evidenceEligible: false,
      endpoint: { url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1h`, connectorType: "json", aggregator: "finance.yahoo.com", requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
      discoveredFrom: evidence("Thysrael/Horizon", "data/config.example.json", symbol),
    });
  }
}
for (const language of horizon.sources.ossinsight?.languages ?? []) {
  const params = new URLSearchParams({ period: horizon.sources.ossinsight.period ?? "past_24_hours", language });
  addChannel({
    identity: `ossinsight:trending:${language.toLowerCase()}`,
    publisherName: `OSS Insight ${language}`,
    publisherRole: "研究",
    channelType: "github-trending",
    channelIdentifier: language,
    contentCapability: "structured-data",
    evidenceEligible: false,
    endpoint: { url: `https://api.ossinsight.io/v1/trends/repos?${params}`, connectorType: "json", aggregator: "api.ossinsight.io", requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
    discoveredFrom: evidence("Thysrael/Horizon", "data/config.example.json", language),
  });
}
if (horizon.sources.gdelt) {
  const params = new URLSearchParams({ query: horizon.sources.gdelt.query, mode: horizon.sources.gdelt.mode, maxrecords: String(horizon.sources.gdelt.max_records), format: "json" });
  addChannel({
    identity: `gdelt:${horizon.sources.gdelt.query.toLowerCase()}`,
    publisherName: `GDELT: ${horizon.sources.gdelt.query}`,
    publisherRole: "媒体",
    channelType: "news-search",
    channelIdentifier: horizon.sources.gdelt.query,
    contentCapability: "metadata",
    evidenceEligible: false,
    endpoint: { url: `https://api.gdeltproject.org/api/v2/doc/doc?${params}`, connectorType: "json", aggregator: "gdeltproject.org", requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
    discoveredFrom: evidence("Thysrael/Horizon", "data/config.example.json", horizon.sources.gdelt.query),
  });
}
if (horizon.sources.google_news) {
  const source = horizon.sources.google_news;
  const params = new URLSearchParams({ q: source.query, hl: `${source.language}-${source.country}`, gl: source.country, ceid: `${source.country}:${source.language}` });
  rssCandidate({ title: `Google News: ${source.query}`, url: `https://news.google.com/rss/search?${params}`, family: "news-search", repository: "Thysrael/Horizon", path: "data/config.example.json" });
}

// Horizon also distributes a production-oriented GitHub config and domain presets.
// They contain concrete sources that do not all appear in config.example.json.
function addHorizonConcreteSources(sources, path) {
  for (const item of sources.github ?? []) {
    const isRelease = item.type === "repo_releases" || Boolean(item.owner && item.repo);
    const identifier = isRelease ? `${item.owner}/${item.repo}` : item.username;
    if (!identifier) continue;
    addChannel({
      identity: `${isRelease ? "github-release" : "github-user"}:${identifier.toLowerCase()}`,
      publisherName: identifier,
      publisherRole: isRelease ? "官方" : "评论",
      channelType: isRelease ? "github-release" : "github-user-events",
      channelIdentifier: identifier,
      homeUrl: `https://github.com/${identifier}`,
      contentCapability: isRelease ? "fulltext" : "metadata",
      endpoint: {
        url: isRelease
          ? `https://api.github.com/repos/${identifier}/releases?per_page=10`
          : `https://api.github.com/users/${identifier}/events/public?per_page=30`,
        connectorType: isRelease ? "github-releases" : "github-user-events",
        aggregator: null,
        requiresAuth: false,
        validation: { status: "not_checked", checkedAt: null },
      },
      discoveredFrom: evidence("Thysrael/Horizon", path, identifier),
    });
  }

  for (const item of sources.rss ?? []) {
    if (!item.url) continue;
    if (item.url.includes("${")) {
      addUnresolved({
        repository: "Thysrael/Horizon",
        path,
        kind: "credentialized_feed",
        publisherName: item.name,
        identifier: item.url,
        reason: "Feed requires a subscriber key and cannot be tested without authorization.",
      });
      continue;
    }
    rssCandidate({ title: item.name, url: item.url, family: "article", repository: "Thysrael/Horizon", path });
  }

  for (const item of sources.reddit?.subreddits ?? []) {
    const name = item.subreddit;
    if (!name) continue;
    addChannel({
      identity: `reddit:subreddit:${name.toLowerCase()}`,
      publisherName: `r/${name}`,
      publisherRole: "评论",
      channelType: "reddit",
      channelIdentifier: `r/${name}`,
      homeUrl: `https://www.reddit.com/r/${name}/`,
      endpoint: {
        url: `https://www.reddit.com/r/${name}/${item.sort ?? "hot"}.json?limit=${item.fetch_limit ?? 25}`,
        connectorType: "reddit",
        aggregator: null,
        requiresAuth: false,
        validation: { status: "not_checked", checkedAt: null },
      },
      discoveredFrom: evidence("Thysrael/Horizon", path, `r/${name}`),
    });
  }

  for (const item of sources.telegram?.channels ?? []) {
    const handle = item.channel;
    if (!handle) continue;
    addChannel({
      identity: `telegram:${handle.toLowerCase()}`,
      publisherName: handle,
      publisherRole: "媒体",
      channelType: "telegram",
      channelIdentifier: handle,
      homeUrl: `https://t.me/${handle}`,
      contentCapability: "feed-content",
      endpoint: {
        url: `https://t.me/s/${handle}`,
        connectorType: "telegram-html",
        aggregator: null,
        requiresAuth: false,
        validation: { status: "not_checked", checkedAt: null },
      },
      discoveredFrom: evidence("Thysrael/Horizon", path, handle),
    });
  }
}

const horizonGithub = JSON.parse(await readFile(join(repositoryPaths.get("Horizon"), "data/config.github.json"), "utf8"));
addHorizonConcreteSources(horizonGithub.sources ?? {}, "data/config.github.json");

const horizonPresets = JSON.parse(await readFile(join(repositoryPaths.get("Horizon"), "data/presets.json"), "utf8"));
for (const domain of horizonPresets.domains ?? []) {
  const sources = { github: [], rss: [], reddit: { subreddits: [] } };
  for (const source of domain.sources ?? []) {
    if (source.type === "rss") sources.rss.push(source.config);
    if (source.type === "reddit_subreddit") sources.reddit.subreddits.push(source.config);
    if (source.type === "github_user") sources.github.push({ type: "user_events", username: source.config.username });
    if (source.type === "github_repo") sources.github.push({ type: "repo_releases", owner: source.config.owner, repo: source.config.repo });
  }
  addHorizonConcreteSources(sources, `data/presets.json#${domain.id}`);
}

// follow-builders: complete distributed default list.
const follow = JSON.parse(await readFile(join(repositoryPaths.get("follow-builders"), "config/default-sources.json"), "utf8"));
for (const podcast of follow.podcasts ?? []) {
  const wrapper = new URL(podcast.rssUrl);
  const underlying = wrapper.hostname === "pod2txt.vercel.app" ? wrapper.searchParams.get("url") : null;
  rssCandidate({ title: podcast.name, url: underlying ?? podcast.rssUrl, family: "podcast", repository: "zarazhangrui/follow-builders", path: "config/default-sources.json", homeUrl: podcast.url, capability: underlying ? "feed-content" : "transcript" });
  if (underlying) {
    addChannel({
      identity: `feed:${normalizeUrl(underlying)}`,
      publisherName: podcast.name,
      channelType: "podcast",
      channelIdentifier: normalizeUrl(underlying),
      homeUrl: nonVideoHomeUrl(podcast.url, underlying),
      contentCapability: "transcript",
      endpoint: { url: podcast.rssUrl, connectorType: "rss", aggregator: "pod2txt.vercel.app", requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
      discoveredFrom: evidence("zarazhangrui/follow-builders", "config/default-sources.json", podcast.rssUrl),
    });
  }
}
for (const blog of follow.blogs ?? []) {
  addChannel({
    identity: `web:${normalizeUrl(blog.indexUrl)}`,
    publisherName: blog.name,
    publisherRole: "官方",
    channelType: "official-blog",
    channelIdentifier: normalizeUrl(blog.indexUrl),
    homeUrl: blog.indexUrl,
    contentCapability: "fulltext",
    endpoint: { url: blog.indexUrl, connectorType: "html-index", aggregator: null, requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
    discoveredFrom: evidence("zarazhangrui/follow-builders", "config/default-sources.json", blog.indexUrl),
  });
}
for (const account of follow.x_accounts ?? []) {
  addChannel({
    identity: `x:${account.handle.toLowerCase()}`,
    publisherName: account.name,
    publisherRole: "评论",
    channelType: "x",
    channelIdentifier: account.handle,
    homeUrl: `https://x.com/${account.handle}`,
    contentCapability: "excerpt",
    endpoint: { url: `https://x.com/${account.handle}`, connectorType: "x-api", aggregator: null, requiresAuth: true, validation: { status: "auth_required", checkedAt: null } },
    discoveredFrom: evidence("zarazhangrui/follow-builders", "config/default-sources.json", account.handle),
  });
}

// CloudFlare AI Insight Daily: fixed Folo lists and dynamic Feed IDs.
const cloudflareConfig = await readFile(join(repositoryPaths.get("CloudFlare-AI-Insight-Daily"), "wrangler.toml"), "utf8");
for (const match of cloudflareConfig.matchAll(/(NEWS_AGGREGATOR_LIST_ID|HGPAPERS_LIST_ID|TWITTER_LIST_ID|REDDIT_LIST_ID)\s*=\s*"([^"]+)"/g)) {
  const [, name, id] = match;
  addChannel({
    identity: `folo-list:${id}`,
    publisherName: name,
    publisherRole: "媒体",
    channelType: "dynamic-aggregate-list",
    channelIdentifier: id,
    contentCapability: "feed-content",
    evidenceEligible: false,
    endpoint: { url: "https://api.follow.is/entries", connectorType: "folo", aggregator: "api.follow.is", requiresAuth: true, requestBody: { listId: id }, validation: { status: "auth_required", checkedAt: null } },
    discoveredFrom: evidence("justlovemaki/CloudFlare-AI-Insight-Daily", "wrangler.toml", `${name}=${id}`),
  });
  addUnresolved({ repository: "justlovemaki/CloudFlare-AI-Insight-Daily", path: "wrangler.toml", kind: "dynamic_list_members", publisherName: name, identifier: id, reason: "Folo list membership is runtime external state and is not distributed in the repository." });
}
const projectsUrl = cloudflareConfig.match(/PROJECTS_API_URL\s*=\s*"([^"]+)"/)?.[1];
if (projectsUrl) {
  addChannel({
    identity: "github-trending:cloudflare-config",
    publisherName: "GitHub Trending",
    publisherRole: "研究",
    channelType: "github-trending",
    channelIdentifier: projectsUrl,
    contentCapability: "structured-data",
    evidenceEligible: false,
    endpoint: { url: projectsUrl, connectorType: "json", aggregator: new URL(projectsUrl).hostname, requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
    discoveredFrom: evidence("justlovemaki/CloudFlare-AI-Insight-Daily", "wrangler.toml", projectsUrl),
  });
}
for (const [publisherName, envName, homeUrl, file] of [
  ["AIBase", "AIBASE_FEED_ID", "https://www.aibase.com/", "src/dataSources/aibase.js"],
  ["Hugging Face Daily Papers", "HGPAPERS_FEED_ID", "https://huggingface.co/papers", "src/dataSources/huggingface-papers.js"],
  ["机器之心", "JIQIZHIXIN_FEED_ID", "https://www.jiqizhixin.ai", "src/dataSources/jiqizhixin.js"],
  ["量子位", "QBIT_FEED_ID", "https://www.qbit.ai", "src/dataSources/qbit.js"],
  ["Xiaohu.AI", "XIAOHU_FEED_ID", "https://www.xiaohu.ai", "src/dataSources/xiaohu.js"],
  ["新智元", "XINZHIYUAN_FEED_ID", "https://www.xinzhiyuan.ai", "src/dataSources/xinzhiyuan.js"],
]) {
  addUnresolved({ repository: "justlovemaki/CloudFlare-AI-Insight-Daily", path: file, kind: "missing_feed_id", publisherName, identifier: envName, homeUrl, reason: "The repository references an environment variable but does not publish its Feed ID." });
}

// PrismFlowAgent contributes connector implementations plus a small default task set.
for (const [kind, path, reason] of [
  ["generic_rss_connector", "src/plugins/builtin/adapters/rss/RSSAdapter.ts", "Accepts an arbitrary runtime RSS URL; there is no finite bundled source list."],
  ["generic_folo_connector", "src/plugins/builtin/adapters/follow/FollowApiAdapter.ts", "Accepts an arbitrary runtime listId or feedId; membership is not bundled."],
  ["ai_search_connector", "src/plugins/builtin/adapters/ai/AISearchAdapter.ts", "Model-generated search results are not a stable source registry."],
]) {
  addUnresolved({ repository: "justlovemaki/PrismFlowAgent", path, kind, reason });
}
addChannel({
  identity: "github-trending:github-html",
  publisherName: "GitHub Trending",
  publisherRole: "研究",
  channelType: "github-trending",
  channelIdentifier: "https://github.com/trending",
  contentCapability: "structured-data",
  evidenceEligible: false,
  endpoint: { url: "https://github.com/trending?since=daily", connectorType: "github-trending-html", aggregator: null, requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
  discoveredFrom: evidence("justlovemaki/PrismFlowAgent", "src/plugins/builtin/adapters/github/GitHubTrendingAdapter.ts", "https://github.com/trending"),
});
rssCandidate({
  title: "阮一峰的网络日志",
  url: "http://www.ruanyifeng.com/blog/atom.xml",
  family: "article",
  repository: "justlovemaki/PrismFlowAgent",
  path: "src/config.ts",
  homeUrl: "https://www.ruanyifeng.com/blog/",
});
for (const [name, id] of [["学术论文", "158437917409783808"], ["Reddit", "167576006499975168"]]) {
  addChannel({
    identity: `folo-list:${id}`,
    publisherName: `PrismFlow ${name}`,
    publisherRole: "媒体",
    channelType: "dynamic-aggregate-list",
    channelIdentifier: id,
    contentCapability: "feed-content",
    evidenceEligible: false,
    endpoint: {
      url: "https://api.follow.is/entries",
      connectorType: "folo",
      aggregator: "api.follow.is",
      requiresAuth: true,
      requestBody: { listId: id },
      validation: { status: "auth_required", checkedAt: null },
    },
    discoveredFrom: evidence("justlovemaki/PrismFlowAgent", "src/config.ts", id),
  });
  addUnresolved({
    repository: "justlovemaki/PrismFlowAgent",
    path: "src/config.ts",
    kind: "dynamic_list_members",
    publisherName: name,
    identifier: id,
    reason: "Folo list membership is runtime external state and is not distributed in the repository.",
  });
}
addChannel({
  identity: "github-trending:prism-proxy",
  publisherName: "GitHub Trending (Prism proxy)",
  publisherRole: "研究",
  channelType: "github-trending",
  channelIdentifier: "git-trending.justlikemaki.vip",
  contentCapability: "structured-data",
  evidenceEligible: false,
  endpoint: {
    url: "https://git-trending.justlikemaki.vip/topone/?since=daily",
    connectorType: "json",
    aggregator: "git-trending.justlikemaki.vip",
    requiresAuth: false,
    validation: { status: "not_checked", checkedAt: null },
  },
  discoveredFrom: evidence("justlovemaki/PrismFlowAgent", "src/config.ts", "github-trending daily"),
});
addUnresolved({
  repository: "justlovemaki/PrismFlowAgent",
  path: "src/config.ts",
  kind: "ai_search_query",
  publisherName: "AI 资讯搜索",
  identifier: "AI 行业最新动态",
  reason: "The default AI-search task has no stable upstream publisher or endpoint and cannot be treated as a source.",
});

// Glance: all concrete information/data sources in the distributed example configuration.
const glanceConfig = await readFile(join(repositoryPaths.get("glance"), "docs/glance.yml"), "utf8");
function blockBetween(start, end) {
  const from = glanceConfig.indexOf(start);
  const to = glanceConfig.indexOf(end, from + start.length);
  return glanceConfig.slice(from, to === -1 ? undefined : to);
}
const glanceRss = blockBetween("- type: rss", "- type: twitch-channels");
for (const match of glanceRss.matchAll(/- url:\s*(\S+)(?:\s+title:\s*([^\r\n]+))?/g)) {
  const url = match[1];
  const title = match[2]?.trim() || new URL(url).hostname;
  rssCandidate({ title, url, family: "article", repository: "glanceapp/glance", path: "docs/glance.yml" });
}
const twitchBlock = blockBetween("- type: twitch-channels", "- type: group");
for (const match of twitchBlock.matchAll(/^\s+-\s+([A-Za-z0-9_]+)\s*$/gm)) {
  const handle = match[1];
  addChannel({
    identity: `twitch:${handle.toLowerCase()}`,
    publisherName: handle,
    publisherRole: "评论",
    channelType: "twitch",
    channelIdentifier: handle,
    homeUrl: `https://www.twitch.tv/${handle}`,
    contentCapability: "metadata",
    endpoint: { url: `https://api.twitch.tv/helix/streams?user_login=${handle}`, connectorType: "twitch-api", aggregator: null, requiresAuth: true, validation: { status: "auth_required", checkedAt: null } },
    discoveredFrom: evidence("glanceapp/glance", "docs/glance.yml", handle),
  });
}
addChannel({
  identity: "community:hacker-news",
  publisherName: "Hacker News",
  publisherRole: "评论",
  channelType: "community",
  channelIdentifier: "hacker-news",
  homeUrl: "https://news.ycombinator.com/",
  endpoint: { url: "https://hacker-news.firebaseio.com/v0/topstories.json", connectorType: "hackernews", aggregator: null, requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
  discoveredFrom: evidence("glanceapp/glance", "docs/glance.yml", "hacker-news"),
});
addChannel({
  identity: "community:lobsters",
  publisherName: "Lobsters",
  publisherRole: "评论",
  channelType: "community",
  channelIdentifier: "lobsters",
  homeUrl: "https://lobste.rs/",
  endpoint: { url: "https://lobste.rs/hottest.json", connectorType: "json", aggregator: null, requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
  discoveredFrom: evidence("glanceapp/glance", "docs/glance.yml", "lobsters"),
});
for (const match of glanceConfig.matchAll(/subreddit:\s*([^\s#]+)/g)) {
  const name = match[1];
  addChannel({
    identity: `reddit:subreddit:${name.toLowerCase()}`,
    publisherName: `r/${name}`,
    publisherRole: "评论",
    channelType: "reddit",
    channelIdentifier: `r/${name}`,
    homeUrl: `https://www.reddit.com/r/${name}/`,
    endpoint: { url: `https://www.reddit.com/r/${name}/hot.json?limit=25`, connectorType: "reddit", aggregator: null, requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
    discoveredFrom: evidence("glanceapp/glance", "docs/glance.yml", `r/${name}`),
  });
}
const releasesBlock = blockBetween("repositories:", "# Add more pages");
for (const match of releasesBlock.matchAll(/-\s+([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/g)) {
  const repository = match[1];
  addChannel({
    identity: `github-release:${repository.toLowerCase()}`,
    publisherName: repository,
    publisherRole: "官方",
    channelType: "github-release",
    channelIdentifier: repository,
    homeUrl: `https://github.com/${repository}`,
    contentCapability: "fulltext",
    endpoint: { url: `https://api.github.com/repos/${repository}/releases?per_page=10`, connectorType: "github-releases", aggregator: null, requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
    discoveredFrom: evidence("glanceapp/glance", "docs/glance.yml", repository),
  });
}
const marketBlock = blockBetween("markets:", "- type: releases");
for (const match of marketBlock.matchAll(/- symbol:\s*([^\s#]+)\s+name:\s*([^\r\n]+)/g)) {
  const symbol = match[1];
  addChannel({
    identity: `market:${symbol.toLowerCase()}`,
    publisherName: match[2].trim(),
    publisherRole: "研究",
    channelType: "market-data",
    channelIdentifier: symbol,
    contentCapability: "structured-data",
    evidenceEligible: false,
    endpoint: { url: `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1h`, connectorType: "json", aggregator: "finance.yahoo.com", requiresAuth: false, validation: { status: "not_checked", checkedAt: null } },
    discoveredFrom: evidence("glanceapp/glance", "docs/glance.yml", symbol),
  });
}
addUnresolved({ repository: "glanceapp/glance", path: "docs/glance.yml", kind: "weather_widget", identifier: "London, United Kingdom", reason: "The example names a location, while the weather provider is an implementation detail rather than a content publisher." });

const channels = [...channelsByIdentity.values()]
  .map((channel) => ({
    ...channel,
    endpoints: channel.endpoints.sort((left, right) => Number(left.requiresAuth) - Number(right.requiresAuth) || Number(Boolean(left.aggregator)) - Number(Boolean(right.aggregator)) || left.url.localeCompare(right.url)),
    discoveredFrom: channel.discoveredFrom.sort((left, right) => left.repository.localeCompare(right.repository) || left.path.localeCompare(right.path)),
  }))
  .sort((left, right) => left.channelType.localeCompare(right.channelType) || left.publisherName.localeCompare(right.publisherName, "zh-CN"));

const registry = {
  version: 1,
  revision: `upstream-audit-${generatedAt.slice(0, 10)}`,
  generatedAt,
  auditScope: "Concrete sources distributed by the pinned upstream repositories; runtime-only dynamic memberships are recorded under unresolved.",
  repositories,
  counts: {
    channels: channels.length,
    endpoints: channels.reduce((total, channel) => total + channel.endpoints.length, 0),
    unresolved: unresolved.length,
  },
  channels,
  unresolved: unresolved.sort((left, right) => left.repository.localeCompare(right.repository) || left.kind.localeCompare(right.kind)),
};

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

const csvRows = [[
  "id", "publisher_name", "publisher_role", "owner_entity", "publisher_kind", "evidence_nature", "classification_confidence", "primary_language", "geography", "channel_type", "channel_identifier", "endpoint", "connector", "aggregator", "requires_auth", "evidence_eligible", "content_capability", "validation_status", "discovered_from",
]];
for (const channel of channels) {
  for (const endpoint of channel.endpoints.length ? channel.endpoints : [{ validation: channel.validation }]) {
    csvRows.push([
      channel.id,
      channel.publisherName,
      channel.publisherRole,
      channel.ownerEntity,
      channel.publisherKind,
      channel.evidenceNature,
      channel.classification?.confidence,
      channel.primaryLanguage,
      channel.geography,
      channel.channelType,
      channel.channelIdentifier,
      endpoint.url,
      endpoint.connectorType,
      endpoint.aggregator,
      endpoint.requiresAuth,
      channel.evidenceEligible,
      channel.contentCapability,
      endpoint.validation?.status ?? channel.validation.status,
      channel.discoveredFrom.map((item) => `${item.repository}:${item.path}`).join(" | "),
    ]);
  }
}

await writeFile(outputPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
await writeFile(csvPath, `${csvRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");
console.log(JSON.stringify({ outputPath, csvPath, ...registry.counts }, null, 2));
