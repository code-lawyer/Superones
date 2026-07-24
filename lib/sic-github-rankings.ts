import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchJsonBounded } from "./sic-fetch.ts";
import type { SicBoard, SicBoardItem } from "./sic.ts";

type GithubRankItem = {
  owner: string;
  repo: string;
  stars: number;
  delta24: number;
  delta7: number;
  description: string;
  license: string;
};

type GithubBoardSnapshot = {
  capturedAt: string;
  items: GithubRankItem[];
};

type GithubRankingSnapshot = {
  capturedAt: string;
  trending: GithubBoardSnapshot | null;
  daily: GithubBoardSnapshot | null;
  weekly: GithubBoardSnapshot | null;
};

type GithubRankingStore = { version: 2; snapshots: GithubRankingSnapshot[] };
type LegacyGithubRankingSnapshot = {
  capturedAt: string;
  trending?: GithubRankItem[];
  daily?: GithubRankItem[];
  weekly?: GithubRankItem[];
};
type Candidate = {
  owner: string;
  repo: string;
  stars?: number;
  delta24?: number;
  delta7?: number;
};

const dataRoot = process.env.VAULT2077_DATA_DIR
  ? path.resolve(process.env.VAULT2077_DATA_DIR)
  : path.join(process.cwd(), "data");
const storePath = path.join(dataRoot, "sic-github-rankings.json");
const MAX_BOARD_AGE_MS = 36 * 60 * 60 * 1000;
let writeChain: Promise<void> = Promise.resolve();

function emptyStore(): GithubRankingStore {
  return { version: 2, snapshots: [] };
}

function migrateLegacyStore(value: { version?: number; snapshots?: LegacyGithubRankingSnapshot[] }) {
  if (value.version !== 1 || !Array.isArray(value.snapshots)) return null;
  return {
    version: 2 as const,
    snapshots: value.snapshots.map((snapshot) => ({
      capturedAt: snapshot.capturedAt,
      trending: snapshot.trending?.length
        ? { capturedAt: snapshot.capturedAt, items: snapshot.trending }
        : null,
      daily: snapshot.daily?.length
        ? { capturedAt: snapshot.capturedAt, items: snapshot.daily }
        : null,
      weekly: snapshot.weekly?.length
        ? { capturedAt: snapshot.capturedAt, items: snapshot.weekly }
        : null,
    })),
  };
}

async function readStore(): Promise<GithubRankingStore> {
  await mkdir(dataRoot, { recursive: true });
  try {
    const value = JSON.parse(await readFile(storePath, "utf8")) as GithubRankingStore | {
      version?: number;
      snapshots?: LegacyGithubRankingSnapshot[];
    };
    if (value.version === 2 && Array.isArray(value.snapshots)) return value as GithubRankingStore;
    const migrated = migrateLegacyStore(value as { version?: number; snapshots?: LegacyGithubRankingSnapshot[] });
    if (migrated) return migrated;
    throw new Error("SiC GitHub 榜单快照格式无效。");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw new Error("SiC GitHub 榜单快照格式无效。");
  }
}

async function writeStore(store: GithubRankingStore) {
  await mkdir(dataRoot, { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(temporaryPath, storePath);
}

function boardItem(item: GithubRankItem, value: number): SicBoardItem {
  return {
    id: `${item.owner}/${item.repo}`,
    name: `${item.owner}/${item.repo}`,
    value,
    href: `/sic/${item.owner}/${item.repo}`,
    address: `https://github.com/${item.owner}/${item.repo}`,
  };
}

function latestBoard(
  snapshots: GithubRankingSnapshot[],
  key: "trending" | "daily" | "weekly",
) {
  const board = snapshots.flatMap((snapshot) => snapshot[key] ? [snapshot[key]] : []).at(-1);
  if (!board) return [];
  const age = Date.now() - new Date(board.capturedAt).getTime();
  return Number.isFinite(age) && age >= 0 && age <= MAX_BOARD_AGE_MS ? board.items : [];
}

export async function getGithubRankingBoards(): Promise<SicBoard[]> {
  const snapshots = (await readStore()).snapshots;
  const trending = latestBoard(snapshots, "trending");
  const daily = latestBoard(snapshots, "daily");
  const weekly = latestBoard(snapshots, "weekly");
  return [
    {
      id: "github-trending",
      eyebrow: "GITHUB / OFFICIAL",
      title: "Github Trending",
      metric: "累计 Star",
      description: "GitHub 官方 Trending 的当日项目快照。",
      emptyMessage: "本期数据正在整理。",
      items: trending.map((item) => boardItem(item, item.stars)),
    },
    {
      id: "github-24h",
      eyebrow: "GITHUB / ALL REPOS",
      title: "24Hours热点",
      metric: "新增 Star",
      description: "全站公开仓库在近 24 小时内的新增 Star。",
      emptyMessage: "本期数据正在整理。",
      items: daily.map((item) => boardItem(item, item.delta24)),
    },
    {
      id: "github-7d",
      eyebrow: "GITHUB / ALL REPOS",
      title: "7days趋势",
      metric: "新增 Star",
      description: "全站公开仓库在近 7 天内的新增 Star。",
      emptyMessage: "本期数据正在整理。",
      items: weekly.map((item) => boardItem(item, item.delta7)),
    },
  ];
}

export async function getGithubRankingProject(owner: string, repo: string) {
  const store = await readStore();
  const history = [...store.snapshots].reverse().flatMap((snapshot) => [
    ...(snapshot.trending?.items ?? []),
    ...(snapshot.daily?.items ?? []),
    ...(snapshot.weekly?.items ?? []),
  ]);
  return history.find((item) => (
    item.owner.toLowerCase() === owner.toLowerCase()
    && item.repo.toLowerCase() === repo.toLowerCase()
  )) ?? null;
}

function text(value: unknown, limit: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function readmeIntro(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const markdown = Buffer.from(value, "base64").toString("utf8")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    const paragraphs = markdown
      .split(/\r?\n\s*\r?\n/)
      .map((paragraph) => paragraph
        .replace(/^\s{0,3}#{1,6}\s*/gm, "")
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/\|[^|\n]*\|/g, " ")
        .replace(/[`*_>#]/g, " ")
        .replace(/\s+/g, " ")
        .trim())
      .filter((paragraph) => (
        paragraph.length >= 40
        && !/^(build|coverage|license|install|documentation|table of contents)\b/i.test(paragraph)
      ));
    return text(paragraphs[0], 200);
  } catch {
    return "";
  }
}

function repositoryName(value: unknown) {
  const match = text(value, 220).match(/^([^/\s]+)\/([^/\s]+)$/);
  return match ? { owner: match[1], repo: match[2] } : null;
}

function trendingCandidates(payload: unknown) {
  const data = payload as { items?: Array<{ title?: unknown; url?: unknown; stars?: unknown }> };
  return (data.items ?? []).flatMap((item) => {
    const fromTitle = repositoryName(item.title);
    const fromUrl = (() => {
      try {
        const url = new URL(String(item.url));
        if (url.hostname !== "github.com") return null;
        return repositoryName(url.pathname.replace(/^\//, ""));
      } catch {
        return null;
      }
    })();
    const repository = fromTitle ?? fromUrl;
    return repository ? [{ ...repository, stars: Number(item.stars) || 0 }] : [];
  }).slice(0, 20);
}

type BigQueryPayload = {
  jobComplete?: boolean;
  jobReference?: { jobId?: string; location?: string };
  rows?: Array<{ f?: Array<{ v?: unknown }> }>;
};

async function pollBigQuery(
  project: string,
  token: string,
  initial: BigQueryPayload,
) {
  let payload = initial;
  for (let attempt = 0; !payload.jobComplete && attempt < 8; attempt += 1) {
    const jobId = payload.jobReference?.jobId;
    if (!jobId) throw new Error("GH Archive 查询未返回 Job ID。");
    await new Promise((resolve) => setTimeout(resolve, 750));
    const location = payload.jobReference?.location
      ? `?location=${encodeURIComponent(payload.jobReference.location)}`
      : "";
    ({ data: payload } = await fetchJsonBounded<BigQueryPayload>(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries/${encodeURIComponent(jobId)}${location}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    ));
  }
  if (!payload.jobComplete) throw new Error("GH Archive 查询未在限定时间内完成。");
  return payload;
}

async function githubArchiveGrowth(hours: 24 | 168) {
  const project = process.env.VAULT2077_GHARCHIVE_BIGQUERY_PROJECT;
  const token = process.env.VAULT2077_GHARCHIVE_BIGQUERY_ACCESS_TOKEN;
  if (!project || !token) throw new Error("GH Archive BigQuery 未配置。");
  const query = `
    SELECT repo.name AS repository, COUNT(*) AS stars
    FROM \`githubarchive.day.*\`
    WHERE _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL ${hours === 24 ? 2 : 8} DAY)) AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
      AND type = 'WatchEvent'
      AND JSON_VALUE(payload, '$.action') = 'started'
      AND created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${hours} HOUR)
    GROUP BY repository
    ORDER BY stars DESC, repository ASC
    LIMIT 20`;
  const { data: initial } = await fetchJsonBounded<BigQueryPayload>(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(project)}/queries`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, useLegacySql: false, timeoutMs: 20_000 }),
    },
  );
  const payload = await pollBigQuery(project, token, initial);
  return (payload.rows ?? []).flatMap((row) => {
    const repository = repositoryName(row.f?.[0]?.v);
    const stars = Number(row.f?.[1]?.v);
    return repository && Number.isFinite(stars) ? [{ ...repository, stars }] : [];
  });
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
) {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await operation(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function hydrateRepositories(candidates: Candidate[]) {
  const unique = [...new Map(candidates.map((candidate) => [
    `${candidate.owner}/${candidate.repo}`.toLowerCase(),
    candidate,
  ])).values()];
  const token = process.env.GITHUB_TOKEN;
  const hydrated = await mapConcurrent(unique, 6, async (candidate): Promise<GithubRankItem> => {
    const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    try {
      const [{ data: payload }, readmeResult] = await Promise.all([
        fetchJsonBounded<{
          stargazers_count?: unknown;
          description?: unknown;
          license?: { spdx_id?: unknown };
        }>(
          `https://api.github.com/repos/${encodeURIComponent(candidate.owner)}/${encodeURIComponent(candidate.repo)}`,
          { headers },
          { maxBytes: 2 * 1024 * 1024 },
        ),
        fetchJsonBounded<{ content?: unknown }>(
          `https://api.github.com/repos/${encodeURIComponent(candidate.owner)}/${encodeURIComponent(candidate.repo)}/readme`,
          { headers },
          { maxBytes: 4 * 1024 * 1024 },
        ).catch(() => null),
      ]);
      return {
        owner: candidate.owner,
        repo: candidate.repo,
        stars: Number(payload.stargazers_count) || Number(candidate.stars) || 0,
        delta24: candidate.delta24 ?? 0,
        delta7: candidate.delta7 ?? 0,
        description: readmeIntro(readmeResult?.data.content) || text(payload.description, 200) || "仓库介绍暂不可用。",
        license: text(payload.license?.spdx_id, 120) || "未声明",
      };
    } catch {
      return {
        owner: candidate.owner,
        repo: candidate.repo,
        stars: Number(candidate.stars) || 0,
        delta24: candidate.delta24 ?? 0,
        delta7: candidate.delta7 ?? 0,
        description: "仓库介绍暂不可用。",
        license: "未声明",
      };
    }
  });
  return new Map(hydrated.map((item) => [
    `${item.owner}/${item.repo}`.toLowerCase(),
    item,
  ]));
}

function orderedItems(candidates: Candidate[], hydrated: Map<string, GithubRankItem>) {
  return candidates.flatMap((candidate) => {
    const item = hydrated.get(`${candidate.owner}/${candidate.repo}`.toLowerCase());
    if (!item) return [];
    return [{
      ...item,
      delta24: candidate.delta24 ?? 0,
      delta7: candidate.delta7 ?? 0,
    }];
  });
}

export async function refreshGithubRankingSnapshot() {
  const capturedAt = new Date().toISOString();
  const [trendingResult, dailyResult, weeklyResult] = await Promise.allSettled([
    fetchJsonBounded<unknown>(
      "https://raw.githubusercontent.com/isboyjc/github-trending-api/main/data/daily/all.json",
    ).then(({ data }) => trendingCandidates(data)),
    githubArchiveGrowth(24),
    githubArchiveGrowth(168),
  ]);
  const trendingCandidatesResult = trendingResult.status === "fulfilled" ? trendingResult.value : [];
  const dailyCandidates = dailyResult.status === "fulfilled"
    ? dailyResult.value.map((item) => ({ ...item, delta24: item.stars }))
    : [];
  const weeklyCandidates = weeklyResult.status === "fulfilled"
    ? weeklyResult.value.map((item) => ({ ...item, delta7: item.stars }))
    : [];
  if (
    trendingCandidatesResult.length === 0
    && dailyCandidates.length === 0
    && weeklyCandidates.length === 0
  ) {
    throw new Error("所有 GitHub 榜单上游均不可用。");
  }
  const metadata = await hydrateRepositories([
    ...trendingCandidatesResult,
    ...dailyCandidates,
    ...weeklyCandidates,
  ]);
  const snapshot: GithubRankingSnapshot = {
    capturedAt,
    trending: trendingCandidatesResult.length
      ? { capturedAt, items: orderedItems(trendingCandidatesResult, metadata) }
      : null,
    daily: dailyCandidates.length
      ? { capturedAt, items: orderedItems(dailyCandidates, metadata) }
      : null,
    weekly: weeklyCandidates.length
      ? { capturedAt, items: orderedItems(weeklyCandidates, metadata) }
      : null,
  };

  const operation = writeChain.then(async () => {
    const store = await readStore();
    const day = capturedAt.slice(0, 10);
    const existing = store.snapshots.find((item) => item.capturedAt.slice(0, 10) === day);
    const merged: GithubRankingSnapshot = {
      capturedAt,
      trending: snapshot.trending ?? existing?.trending ?? null,
      daily: snapshot.daily ?? existing?.daily ?? null,
      weekly: snapshot.weekly ?? existing?.weekly ?? null,
    };
    const history = store.snapshots.filter((item) => item.capturedAt.slice(0, 10) !== day);
    await writeStore({ version: 2, snapshots: [...history, merged].slice(-31) });
    return {
      capturedAt,
      trending: snapshot.trending
        ? { count: snapshot.trending.items.length }
        : { error: trendingResult.status === "rejected" && trendingResult.reason instanceof Error ? trendingResult.reason.message : "Trending 榜单失败。" },
      daily: snapshot.daily
        ? { count: snapshot.daily.items.length }
        : { error: dailyResult.status === "rejected" && dailyResult.reason instanceof Error ? dailyResult.reason.message : "24H 榜单失败。" },
      weekly: snapshot.weekly
        ? { count: snapshot.weekly.items.length }
        : { error: weeklyResult.status === "rejected" && weeklyResult.reason instanceof Error ? weeklyResult.reason.message : "7D 榜单失败。" },
    };
  });
  writeChain = operation.then(() => undefined, () => undefined);
  return operation;
}

export const sicGithubRankingTestUtils = {
  repositoryName,
  trendingCandidates,
  readmeIntro,
};
