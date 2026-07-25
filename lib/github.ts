import "server-only";

import { createHash } from "node:crypto";
import { withinDurableRateLimit } from "./rate-limit.ts";
import { recordAuditEvent } from "./security-audit.ts";
import { mutateStateDocument, readStateDocument, type StateDocumentDefinition } from "./state-document-store.ts";

export type GitHubRepository = {
  owner: string;
  repo: string;
  fullName: string;
  defaultBranch: string;
  stars: number;
  isFork: boolean;
  isArchived: boolean;
  isPrivate: boolean;
  license: string | null;
};

type GitHubCacheEntry = {
  body: string;
  etag: string | null;
  lastModified: string | null;
  fetchedAt: string;
};

type GitHubCacheStore = {
  version: 1;
  entries: Record<string, GitHubCacheEntry>;
};

const githubCacheDocument: StateDocumentDefinition<GitHubCacheStore> = {
  namespace: "github-cache",
  fileName: "github-cache.json",
  create: () => ({ version: 1, entries: {} }),
  parse: (value) => {
    const parsed = value as GitHubCacheStore;
    if (parsed.version !== 1 || !parsed.entries || typeof parsed.entries !== "object") {
      throw new Error("GitHub 条件请求缓存格式无效。");
    }
    return parsed;
  },
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_GITHUB_RESPONSE_BYTES = 1_000_000;
const waiters: Array<() => void> = [];
let activeRequests = 0;

async function withGitHubConcurrency<T>(operation: () => Promise<T>) {
  const limit = Math.max(1, Math.min(16, Number(process.env.VAULT2077_GITHUB_CONCURRENCY ?? 4)));
  if (activeRequests >= limit) await new Promise<void>((resolve) => waiters.push(resolve));
  activeRequests += 1;
  try {
    return await operation();
  } finally {
    activeRequests -= 1;
    waiters.shift()?.();
  }
}

export function parseGitHubRepository(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("请输入完整的 GitHub 仓库地址。");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new Error("只接受 https://github.com/owner/repository 格式的公开仓库地址。");
  }
  if (url.search || url.hash) {
    throw new Error("仓库地址不能包含查询参数或页面锚点。");
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || !segments.every((segment) => /^[A-Za-z0-9_.-]+$/.test(segment))) {
    throw new Error("仓库地址必须精确指向一个 owner/repository，不能包含子路径或查询参数。");
  }
  if (segments[1].endsWith(".git")) {
    throw new Error("请使用 GitHub 页面地址，不要使用 .git 克隆地址。");
  }
  return { owner: segments[0], repo: segments[1] };
}

function githubHeaders(url: string) {
  const token = process.env.GITHUB_TOKEN;
  if (!token && process.env.NODE_ENV === "production") {
    throw new Error("Frontier GitHub 直连必须配置服务端只读 GITHUB_TOKEN。");
  }
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "Vault2077-MVP",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token && new URL(url).hostname === "api.github.com" ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function cacheKey(url: string) {
  return createHash("sha256").update(url).digest("hex");
}

async function cachedEntry(url: string) {
  return (await readStateDocument(githubCacheDocument)).entries[cacheKey(url)] ?? null;
}

async function saveCachedEntry(url: string, entry: GitHubCacheEntry) {
  await mutateStateDocument(githubCacheDocument, (store) => {
    store.entries[cacheKey(url)] = entry;
    const ordered = Object.entries(store.entries)
      .sort((left, right) => right[1].fetchedAt.localeCompare(left[1].fetchedAt))
      .slice(0, 2_000);
    store.entries = Object.fromEntries(ordered);
  });
}

async function githubFetch(url: string, options: { cache?: boolean } = {}) {
  const targetHash = cacheKey(url).slice(0, 24);
  const cached = options.cache ? await cachedEntry(url) : null;
  if (cached && Date.now() - Date.parse(cached.fetchedAt) <= CACHE_TTL_MS) {
    await recordAuditEvent({
      actorHash: "system",
      action: "github.fetch",
      targetType: "public-repository",
      targetId: targetHash,
      result: "success",
      diff: { cache: "fresh" },
    });
    return new Response(cached.body, { status: 200, headers: { "content-type": "application/json" } });
  }

  if (!(await withinDurableRateLimit("github:direct", 4_000, 60 * 60 * 1000))) {
    throw new Error("GitHub 直连已达到服务端安全预算，请等待异步回退。");
  }
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await withGitHubConcurrency(() => fetch(url, {
      headers: {
        ...githubHeaders(url),
        ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
        ...(cached?.lastModified ? { "If-Modified-Since": cached.lastModified } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(1_000, Math.min(15_000, Number(process.env.VAULT2077_GITHUB_TIMEOUT_MS ?? 4_000)))),
    }));
  } catch (error) {
    await recordAuditEvent({
      actorHash: "system",
      action: "github.fetch",
      targetType: "public-repository",
      targetId: targetHash,
      result: "failed",
      reason: error instanceof Error ? error.name : "network-error",
      diff: { durationMs: Date.now() - startedAt },
    }).catch(() => undefined);
    throw new Error("暂时无法连接 GitHub。请稍后重试。");
  }
  if (response.status === 304 && cached) {
    const refreshed = { ...cached, fetchedAt: new Date().toISOString() };
    await saveCachedEntry(url, refreshed);
    await recordAuditEvent({
      actorHash: "system",
      action: "github.fetch",
      targetType: "public-repository",
      targetId: targetHash,
      result: "success",
      diff: { cache: "revalidated", durationMs: Date.now() - startedAt },
    });
    return new Response(refreshed.body, { status: 200, headers: { "content-type": "application/json" } });
  }
  if (!response.ok) {
    await recordAuditEvent({
      actorHash: "system",
      action: "github.fetch",
      targetType: "public-repository",
      targetId: targetHash,
      result: "failed",
      reason: `http-${response.status}`,
      diff: { status: response.status, durationMs: Date.now() - startedAt },
    }).catch(() => undefined);
  }
  if (response.status === 404) throw new Error("没有找到该公开 GitHub 仓库。");
  if (response.status === 403 || response.status === 429) throw new Error("GitHub 请求额度暂不可用，请稍后重试。");
  if (!response.ok) throw new Error("GitHub 暂时无法返回仓库信息，请稍后重试。");
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > MAX_GITHUB_RESPONSE_BYTES) {
    throw new Error("GitHub 返回内容超过安全大小限制。");
  }
  if (options.cache) {
    await saveCachedEntry(url, {
      body,
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      fetchedAt: new Date().toISOString(),
    });
  }
  await recordAuditEvent({
    actorHash: "system",
    action: "github.fetch",
    targetType: "public-repository",
    targetId: targetHash,
    result: "success",
    diff: { cache: "miss", status: response.status, durationMs: Date.now() - startedAt },
  });
  return new Response(body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "text/plain" } });
}

export async function inspectGitHubRepository(owner: string, repo: string): Promise<GitHubRepository> {
  const response = await githubFetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { cache: true },
  );
  const data = await response.json() as {
    full_name?: unknown; default_branch?: unknown; stargazers_count?: unknown; fork?: unknown; archived?: unknown; private?: unknown; license?: { spdx_id?: unknown } | null;
  };
  if (typeof data.full_name !== "string" || typeof data.default_branch !== "string" || typeof data.stargazers_count !== "number") {
    throw new Error("GitHub 返回的仓库数据不完整。");
  }
  return {
    owner,
    repo,
    fullName: data.full_name,
    defaultBranch: data.default_branch,
    stars: data.stargazers_count,
    isFork: data.fork === true,
    isArchived: data.archived === true,
    isPrivate: data.private === true,
    license: data.license && typeof data.license.spdx_id === "string" ? data.license.spdx_id : null,
  };
}

export async function readGitHubChallengeFile(owner: string, repo: string, branch: string, filePath: string) {
  const safePath = filePath.split("/").map(encodeURIComponent).join("/");
  const response = await githubFetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${safePath}`);
  return response.text();
}
