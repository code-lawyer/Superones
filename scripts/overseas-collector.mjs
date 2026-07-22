import { createHmac } from "node:crypto";

const domesticUrl = required("VAULT2077_DOMESTIC_INGEST_URL");
const sharedSecret = required("VAULT2077_PIPELINE_SHARED_SECRET");
const trendingUrl = required("VAULT2077_TRENDING_API_URL");
const githubToken = process.env.GITHUB_TOKEN;
const releaseRepositories = (process.env.VAULT2077_RELEASE_REPOSITORIES ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value));
const rssDocumentsFile = process.env.VAULT2077_RSS_DOCUMENTS_FILE;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function githubHeaders(accept = "application/vnd.github+json") {
  return {
    Accept: accept,
    "User-Agent": "Vault2077-Overseas-Collector",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
  };
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

function text(value, limit) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

async function rssDocuments() {
  if (!rssDocumentsFile) return [];
  const { readFile } = await import("node:fs/promises");
  const value = JSON.parse(await readFile(rssDocumentsFile, "utf8"));
  if (!Array.isArray(value)) throw new Error("RSS collector output must be an array.");
  return value;
}

function trendItems(payload) {
  const items = Array.isArray(payload) ? payload : payload.repositories ?? payload.items ?? payload.data ?? [];
  if (!Array.isArray(items)) throw new Error("Trending API response has no repository array.");
  return items.slice(0, 20).map((item) => {
    const owner = text(item.author ?? item.owner ?? item.username, 100);
    const repo = text(item.name ?? item.repository ?? item.repo, 100);
    if (!owner || !repo || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;
    return { owner, repo, delta24: Number(item.currentPeriodStars ?? item.starsToday ?? item.stars_since ?? 0) || 0 };
  }).filter(Boolean);
}

async function githubProject(candidate) {
  const encoded = `${encodeURIComponent(candidate.owner)}/${encodeURIComponent(candidate.repo)}`;
  const repository = await fetchJson(`https://api.github.com/repos/${encoded}`, githubHeaders());
  let readme = null;
  try {
    readme = await fetchJson(`https://api.github.com/repos/${encoded}/readme`, githubHeaders());
  } catch {
    // A README is useful enrichment, not a reason to discard an otherwise valid trend.
  }
  const readmeText = typeof readme?.content === "string" ? Buffer.from(readme.content, "base64").toString("utf8") : "";
  return {
    owner: candidate.owner,
    repo: candidate.repo,
    url: `https://github.com/${candidate.owner}/${candidate.repo}`,
    description: text(repository.description, 2_000),
    readme: readmeText.slice(0, 24_000),
    readmeSha: text(readme?.sha, 120),
    language: text(repository.language, 120),
    stars: Number(repository.stargazers_count) || 0,
    delta24: Math.max(0, Math.round(candidate.delta24)),
    delta7: 0,
    license: text(repository.license?.spdx_id, 120),
    updatedAt: repository.updated_at,
  };
}

async function releaseDocuments(repository) {
  const [owner, repo] = repository.split("/");
  const releases = await fetchJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=1`, githubHeaders());
  if (!Array.isArray(releases) || releases.length === 0) return [];
  const release = releases[0];
  const url = text(release.html_url, 2048);
  const publishedAt = text(release.published_at ?? release.created_at, 64);
  if (!url || !publishedAt) return [];
  return [{
    sourceId: `github-release:${repository.toLowerCase()}`,
    sourceName: `${repository} GitHub Release`,
    url,
    title: text(release.name ?? release.tag_name, 500) || `${repository} release`,
    text: text(release.body, 24_000),
    publishedAt,
    category: "公司公告",
  }];
}

const trends = trendItems(await fetchJson(trendingUrl));
const projectResults = await Promise.allSettled(trends.map(githubProject));
const releaseResults = await Promise.allSettled(releaseRepositories.map(releaseDocuments));
const projects = projectResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
const documents = [...await rssDocuments(), ...releaseResults.flatMap((result) => result.status === "fulfilled" ? result.value : [])];
const packet = { version: 1, collectedAt: new Date().toISOString(), documents, projects };
const payload = JSON.stringify(packet);
const signature = `sha256=${createHmac("sha256", sharedSecret).update(payload).digest("base64url")}`;
const response = await fetch(domesticUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Vault2077-Signature": signature },
  body: payload,
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Domestic ingest returned HTTP ${response.status}: ${await response.text()}`);
console.log(await response.text());
