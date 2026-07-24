import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchJsonBounded, fetchTextBounded } from "./sic-fetch.ts";

export type DirectRankingProvider = "github" | "hugging_face" | "openrouter" | "skills";

export type DirectRankingItem = {
  id: string;
  name: string;
  provider: DirectRankingProvider;
  providerView: string;
  providerRank: number;
  providerMetric: string;
  value: number | null;
  capturedAt: string;
  sourceUrl: string;
  itemUrl: string;
  description?: string;
};

export type DirectRankingBoard = {
  id: string;
  provider: DirectRankingProvider;
  providerView: string;
  title: string;
  eyebrow: string;
  providerMetric: string;
  capturedAt: string;
  sourceUrl: string;
  items: DirectRankingItem[];
};

type DirectRankingStore = {
  version: 1;
  boards: DirectRankingBoard[];
};

export type DirectRankingRefreshResult = {
  capturedAt: string;
  boards: DirectRankingBoard[];
  errors: Record<string, string>;
};

const MAX_BOARD_AGE_MS = 36 * 60 * 60 * 1000;
const dataRoot = process.env.VAULT2077_DATA_DIR
  ? path.resolve(process.env.VAULT2077_DATA_DIR)
  : path.join(process.cwd(), "data");
const rankingStorePath = path.join(dataRoot, "direct-rankings.json");
let writeChain: Promise<void> = Promise.resolve();

function decodeHtml(value: string) {
  const entities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name: string) => entities[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

function numericMetric(value: string) {
  const normalized = value.replace(/,/g, "").trim();
  const match = /^([\d.]+)\s*([KMB])?$/i.exec(normalized);
  if (!match) return null;
  const multiplier = match[2]?.toUpperCase() === "K"
    ? 1_000
    : match[2]?.toUpperCase() === "M"
      ? 1_000_000
      : match[2]?.toUpperCase() === "B"
        ? 1_000_000_000
        : 1;
  return Math.round(Number(match[1]) * multiplier);
}

function item(input: Omit<DirectRankingItem, "providerRank">, index: number): DirectRankingItem {
  return { ...input, providerRank: index + 1 };
}

export function parseGithubTrending(
  html: string,
  input: { capturedAt: string; providerView: "today" | "week" | "month"; sourceUrl: string },
) {
  const period = input.providerView === "today"
    ? "today"
    : input.providerView === "week"
      ? "this week"
      : "this month";
  const articles = html.match(/<article\b[^>]*class="[^"]*\bBox-row\b[^"]*"[^>]*>[\s\S]*?<\/article>/gi) ?? [];
  return articles.flatMap((article, index) => {
    const repository = /href="\/([^/"?#\s]+)\/([^/"?#\s]+)"/i.exec(article);
    if (!repository) return [];
    const owner = decodeHtml(repository[1]);
    const repo = decodeHtml(repository[2]);
    const metric = new RegExp(`([\\d,]+)\\s+stars?\\s+${period.replace(" ", "\\s+")}`, "i").exec(decodeHtml(article));
    const description = /<p\b[^>]*class="[^"]*\bcol-9\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(article);
    const name = `${owner}/${repo}`;
    return [item({
      id: name.toLowerCase(),
      name,
      provider: "github",
      providerView: input.providerView,
      providerMetric: `Stars ${period}`,
      value: metric ? numericMetric(metric[1]) : null,
      capturedAt: input.capturedAt,
      sourceUrl: input.sourceUrl,
      itemUrl: `https://github.com/${owner}/${repo}`,
      description: description ? decodeHtml(description[1]).slice(0, 300) : undefined,
    }, index)];
  });
}

export function parseHuggingFaceTrending(
  payload: unknown,
  input: { capturedAt: string; sourceUrl: string },
) {
  if (!Array.isArray(payload)) throw new Error("Hugging Face Trending 返回结构无效。");
  return payload.slice(0, 20).flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const model = value as Record<string, unknown>;
    const id = typeof model.id === "string" ? model.id : typeof model.modelId === "string" ? model.modelId : "";
    if (!id) return [];
    return [item({
      id,
      name: id,
      provider: "hugging_face",
      providerView: "trending",
      providerMetric: "Official Trending",
      value: null,
      capturedAt: input.capturedAt,
      sourceUrl: input.sourceUrl,
      itemUrl: `https://huggingface.co/${id}`,
    }, index)];
  });
}

export function parseOpenRouterWeekly(
  payload: unknown,
  input: { capturedAt: string; sourceUrl: string },
) {
  const data = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { data?: unknown }).data
    : null;
  if (!Array.isArray(data)) throw new Error("OpenRouter 周榜返回结构无效。");
  return data.slice(0, 20).flatMap((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const model = value as Record<string, unknown>;
    const id = typeof model.id === "string" ? model.id : "";
    if (!id) return [];
    const name = typeof model.name === "string" ? model.name : id;
    return [item({
      id,
      name,
      provider: "openrouter",
      providerView: "top-weekly",
      providerMetric: "Weekly tokens rank",
      value: null,
      capturedAt: input.capturedAt,
      sourceUrl: input.sourceUrl,
      itemUrl: `https://openrouter.ai/${id}`,
    }, index)];
  });
}

export function parseSkillsRanking(
  html: string,
  input: {
    capturedAt: string;
    providerView: "all-time" | "trending-24h" | "hot";
    sourceUrl: string;
  },
) {
  const anchors = html.match(/<a\b[^>]*href="\/[^"]+"[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  const seen = new Set<string>();
  const values: DirectRankingItem[] = [];
  for (const anchor of anchors) {
    const href = /href="([^"]+)"/i.exec(anchor)?.[1] ?? "";
    const text = decodeHtml(anchor);
    const match = /^(\d+)\s+([^\s]+)\s+([^\s]+\/[^\s]+)\s+([\d.]+[KMB]?)(?:\s+[+-]?\d+)?$/i.exec(text);
    if (!match || seen.has(href)) continue;
    seen.add(href);
    values.push({
      id: href,
      name: `${match[2]} · ${match[3]}`,
      provider: "skills",
      providerView: input.providerView,
      providerRank: Number(match[1]),
      providerMetric: input.providerView === "all-time"
        ? "All-time installs"
        : input.providerView === "trending-24h"
          ? "Trending 24h installs"
          : "Hot installs",
      value: numericMetric(match[4]),
      capturedAt: input.capturedAt,
      sourceUrl: input.sourceUrl,
      itemUrl: new URL(href, input.sourceUrl).toString(),
    });
    if (values.length >= 20) break;
  }
  return values;
}

function board(input: Omit<DirectRankingBoard, "items">, items: DirectRankingItem[]) {
  if (items.length === 0) throw new Error(`${input.provider}/${input.providerView} 没有返回榜单条目。`);
  return { ...input, items };
}

async function githubBoard(
  capturedAt: string,
  providerView: "today" | "week" | "month",
  since: "daily" | "weekly" | "monthly",
) {
  const sourceUrl = `https://github.com/trending?since=${since}`;
  const { text } = await fetchTextBounded(sourceUrl, {
    headers: { Accept: "text/html", "User-Agent": "Vault2077-Ranking-Collector/1.0" },
  });
  const title = providerView === "today" ? "GitHub 今日趋势" : providerView === "week" ? "GitHub 本周趋势" : "GitHub 本月趋势";
  return board({
    id: `github:${providerView}`,
    provider: "github",
    providerView,
    title,
    eyebrow: "GITHUB / OFFICIAL TRENDING",
    providerMetric: `GitHub ${providerView}`,
    capturedAt,
    sourceUrl,
  }, parseGithubTrending(text, { capturedAt, providerView, sourceUrl }));
}

async function huggingFaceBoard(capturedAt: string) {
  const sourceUrl = "https://huggingface.co/models?sort=trending";
  const apiUrl = "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=20";
  const { data } = await fetchJsonBounded<unknown>(apiUrl, { headers: { Accept: "application/json" } });
  return board({
    id: "hugging-face:trending",
    provider: "hugging_face",
    providerView: "trending",
    title: "Hugging Face Trending",
    eyebrow: "HUGGING FACE / OFFICIAL",
    providerMetric: "Official Trending",
    capturedAt,
    sourceUrl,
  }, parseHuggingFaceTrending(data, { capturedAt, sourceUrl }));
}

async function openRouterBoard(capturedAt: string) {
  const sourceUrl = "https://openrouter.ai/api/v1/models?sort=top-weekly";
  const { data } = await fetchJsonBounded<unknown>(sourceUrl, { headers: { Accept: "application/json" } });
  return board({
    id: "openrouter:top-weekly",
    provider: "openrouter",
    providerView: "top-weekly",
    title: "OpenRouter 周榜",
    eyebrow: "OPENROUTER / OFFICIAL",
    providerMetric: "Weekly tokens rank",
    capturedAt,
    sourceUrl,
  }, parseOpenRouterWeekly(data, { capturedAt, sourceUrl }));
}

async function skillsBoard(
  capturedAt: string,
  providerView: "all-time" | "trending-24h" | "hot",
  pathname: "/" | "/trending" | "/hot",
) {
  const sourceUrl = new URL(pathname, "https://www.skills.sh").toString();
  const { text } = await fetchTextBounded(sourceUrl, {
    headers: { Accept: "text/html", "User-Agent": "Vault2077-Ranking-Collector/1.0" },
  });
  const title = providerView === "all-time" ? "Skill All Time" : providerView === "trending-24h" ? "Skill Trending 24h" : "Skill Hot";
  return board({
    id: `skills:${providerView}`,
    provider: "skills",
    providerView,
    title,
    eyebrow: "SKILLS.SH / OFFICIAL",
    providerMetric: providerView,
    capturedAt,
    sourceUrl,
  }, parseSkillsRanking(text, { capturedAt, providerView, sourceUrl }));
}

async function readStore(): Promise<DirectRankingStore> {
  await mkdir(dataRoot, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(rankingStorePath, "utf8")) as DirectRankingStore;
    if (parsed.version !== 1 || !Array.isArray(parsed.boards)) throw new Error("invalid");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, boards: [] };
    throw new Error("平台原生榜单存储格式无效。");
  }
}

async function writeStore(value: DirectRankingStore) {
  await mkdir(dataRoot, { recursive: true });
  const temporary = `${rankingStorePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, rankingStorePath);
}

export function persistDirectRankingBoards(boards: DirectRankingBoard[]) {
  writeChain = writeChain.then(async () => {
    const current = await readStore();
    const byId = new Map(current.boards.map((value) => [value.id, value]));
    for (const value of boards) byId.set(value.id, value);
    await writeStore({ version: 1, boards: [...byId.values()] });
  });
  return writeChain;
}

export async function refreshDirectRankings(): Promise<DirectRankingRefreshResult> {
  const capturedAt = new Date().toISOString();
  const requests = [
    { id: "github:today", run: () => githubBoard(capturedAt, "today", "daily") },
    { id: "github:week", run: () => githubBoard(capturedAt, "week", "weekly") },
    { id: "github:month", run: () => githubBoard(capturedAt, "month", "monthly") },
    { id: "hugging-face:trending", run: () => huggingFaceBoard(capturedAt) },
    { id: "openrouter:top-weekly", run: () => openRouterBoard(capturedAt) },
    { id: "skills:all-time", run: () => skillsBoard(capturedAt, "all-time", "/") },
    { id: "skills:trending-24h", run: () => skillsBoard(capturedAt, "trending-24h", "/trending") },
    { id: "skills:hot", run: () => skillsBoard(capturedAt, "hot", "/hot") },
  ];
  async function withRetry(request: () => Promise<DirectRankingBoard>) {
    try {
      return await request();
    } catch {
      return request();
    }
  }
  const settled = await Promise.allSettled(requests.map((request) => withRetry(request.run)));
  const boards = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const errors = Object.fromEntries(settled.flatMap((result, index) => result.status === "rejected"
    ? [[requests[index].id, result.reason instanceof Error ? result.reason.message : String(result.reason)]]
    : []));
  if (boards.length > 0) await persistDirectRankingBoards(boards);
  return { capturedAt, boards, errors };
}

export async function getDirectRankingBoards() {
  const now = Date.now();
  return (await readStore()).boards
    .filter((value) => {
      const age = now - Date.parse(value.capturedAt);
      return Number.isFinite(age) && age >= 0 && age <= MAX_BOARD_AGE_MS;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export async function getDirectGithubProject(owner: string, repo: string) {
  const key = `${owner}/${repo}`.toLowerCase();
  return (await readStore()).boards
    .filter((value) => value.provider === "github")
    .flatMap((value) => value.items)
    .find((value) => value.id.toLowerCase() === key) ?? null;
}
