import "server-only";

import { fetchJsonBounded } from "./sic-fetch.ts";
import { mutateStateDocument, readStateDocument, type StateDocumentDefinition } from "./state-document-store.ts";

export type DirectRankingProvider = "github" | "hugging_face" | "openrouter";

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
const DIRECT_RANKING_BOARD_DEFINITIONS = [
  { id: "github:today", provider: "github", providerView: "today" },
  { id: "github:week", provider: "github", providerView: "week" },
  { id: "github:month", provider: "github", providerView: "month" },
  { id: "hugging-face:trending", provider: "hugging_face", providerView: "trending" },
  { id: "openrouter:top-weekly", provider: "openrouter", providerView: "top-weekly" },
] as const satisfies ReadonlyArray<Pick<DirectRankingBoard, "id" | "provider" | "providerView">>;
const DIRECT_RANKING_BOARD_ORDER = new Map<string, number>(
  DIRECT_RANKING_BOARD_DEFINITIONS.map((definition, index) => [definition.id, index]),
);

function isSupportedDirectRankingBoard(value: unknown): value is DirectRankingBoard {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const boardValue = value as Partial<DirectRankingBoard>;
  const definition = DIRECT_RANKING_BOARD_DEFINITIONS.find(({ id }) => id === boardValue.id);
  return Boolean(
    definition
    && boardValue.provider === definition.provider
    && boardValue.providerView === definition.providerView
    && Array.isArray(boardValue.items),
  );
}

const directRankingsDocument: StateDocumentDefinition<DirectRankingStore> = {
  namespace: "direct-rankings",
  fileName: "direct-rankings.json",
  create: () => ({ version: 1, boards: [] }),
  parse: (value) => {
    const parsed = value as DirectRankingStore;
    if (parsed.version !== 1 || !Array.isArray(parsed.boards)) {
      throw new Error("平台原生榜单存储格式无效。");
    }
    return {
      ...parsed,
      boards: parsed.boards.filter(isSupportedDirectRankingBoard),
    };
  },
};

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

export function parseOpenGithubRankReadme(
  payload: unknown,
  input: { capturedAt: string; providerView: "today" | "week" | "month"; sourceUrl: string },
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("OpenGithubs README API 返回结构无效。");
  }
  const response = payload as { content?: unknown; encoding?: unknown };
  if (response.encoding !== "base64" || typeof response.content !== "string") {
    throw new Error("OpenGithubs README API 缺少 base64 内容。");
  }
  const markdown = Buffer.from(response.content.replace(/\s+/g, ""), "base64").toString("utf8");
  const metricLabel = input.providerView === "today"
    ? "Daily star growth"
    : input.providerView === "week"
      ? "Weekly star growth"
      : "Monthly star growth";
  const rows = markdown.matchAll(
    /^\|\s*(\d+)\s*\|\s*\[([^\]]+)\]\((https:\/\/github\.com\/([^/\s)]+)\/([^/\s)#?]+))\)\s*\|\s*([^|]*)\|\s*([^|]*)\|/gmi,
  );
  const values: DirectRankingItem[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const rank = Number(row[1]);
    const name = decodeHtml(row[2]);
    const itemUrl = row[3];
    const identity = `${row[4]}/${row[5]}`.toLowerCase();
    if (rank !== values.length + 1 || seen.has(identity)) {
      if (values.length > 0) break;
      continue;
    }
    const growth = /([\d,.]+\s*[KMB]?)/i.exec(decodeHtml(row[7]))?.[1] ?? "";
    seen.add(identity);
    values.push({
      id: identity,
      name,
      provider: "github",
      providerView: input.providerView,
      providerRank: rank,
      providerMetric: metricLabel,
      value: numericMetric(growth.replace(/\s+/g, "")),
      capturedAt: input.capturedAt,
      sourceUrl: input.sourceUrl,
      itemUrl,
    });
    if (values.length >= 20) break;
  }
  return values;
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

function board(input: Omit<DirectRankingBoard, "items">, items: DirectRankingItem[]) {
  if (items.length === 0) throw new Error(`${input.provider}/${input.providerView} 没有返回榜单条目。`);
  return { ...input, items };
}

async function githubBoard(
  capturedAt: string,
  providerView: "today" | "week" | "month",
  repository: "github-daily-rank" | "github-weekly-rank" | "github-monthly-rank",
) {
  const sourceUrl = `https://github.com/OpenGithubs/${repository}`;
  const apiUrl = `https://api.github.com/repos/OpenGithubs/${repository}/readme`;
  const token = process.env.GITHUB_TOKEN?.trim();
  const { data } = await fetchJsonBounded<unknown>(apiUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Vault2077-Ranking-Collector/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const title = providerView === "today" ? "GitHub 今日趋势" : providerView === "week" ? "GitHub 本周趋势" : "GitHub 本月趋势";
  return board({
    id: `github:${providerView}`,
    provider: "github",
    providerView,
    title,
    eyebrow: "OPENGITHUBS / GITHUB API",
    providerMetric: providerView === "today"
      ? "Daily star growth"
      : providerView === "week"
        ? "Weekly star growth"
        : "Monthly star growth",
    capturedAt,
    sourceUrl,
  }, parseOpenGithubRankReadme(data, { capturedAt, providerView, sourceUrl }));
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

async function readStore(): Promise<DirectRankingStore> {
  return readStateDocument(directRankingsDocument);
}

export function persistDirectRankingBoards(boards: DirectRankingBoard[]) {
  return mutateStateDocument(directRankingsDocument, (current) => {
    const byId = new Map(current.boards.map((value) => [value.id, value]));
    for (const value of boards) {
      const previous = byId.get(value.id);
      if (
        isSupportedDirectRankingBoard(value)
        && (!previous || Date.parse(value.capturedAt) >= Date.parse(previous.capturedAt))
      ) byId.set(value.id, value);
    }
    current.boards = [...byId.values()];
  });
}

export async function refreshDirectRankings(): Promise<DirectRankingRefreshResult> {
  const capturedAt = new Date().toISOString();
  const requests = [
    { id: "github:today", run: () => githubBoard(capturedAt, "today", "github-daily-rank") },
    { id: "github:week", run: () => githubBoard(capturedAt, "week", "github-weekly-rank") },
    { id: "github:month", run: () => githubBoard(capturedAt, "month", "github-monthly-rank") },
    { id: "hugging-face:trending", run: () => huggingFaceBoard(capturedAt) },
    { id: "openrouter:top-weekly", run: () => openRouterBoard(capturedAt) },
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
    .map((value) => {
      const age = now - Date.parse(value.capturedAt);
      return {
        ...value,
        stale: !Number.isFinite(age) || age < 0 || age > MAX_BOARD_AGE_MS,
      };
    })
    .sort((left, right) => (
      (DIRECT_RANKING_BOARD_ORDER.get(left.id) ?? Number.MAX_SAFE_INTEGER)
      - (DIRECT_RANKING_BOARD_ORDER.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    ));
}
