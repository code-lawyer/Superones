import "server-only";

import { createHash } from "node:crypto";
import {
  EditorialInfrastructureError,
  isEditorialInfrastructureError,
  isFatalEditorialInfrastructureError,
} from "./editorial-failure.ts";
import {
  createEditorialProfileClient,
  loadEditorialProfileConfig,
} from "./openai-compatible-client.ts";
import { fetchTextBounded } from "./sic-fetch.ts";
import { decodeHtmlEntities } from "./decode-html-entities.ts";
import { listCollectableSicSources, type SicSource } from "./sic-source-registry.ts";
import { resolveSicSourceAdapter, type SicSourceAdapterId } from "./sic-source-adapters.ts";
import {
  getSicStoredContent,
  mergeSicStoredContent,
  sicContentIdentityKey,
} from "./sic-content-store.ts";
import type { SicContentItem, SicSourceCollectionReport } from "./sic-content-types.ts";

const SOURCE_CONCURRENCY = 6;
const SIC_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

type SourceFetchOptions = {
  timeoutMs?: number;
  attempts?: number;
  retryDelayMs?: number;
  retryStatuses?: number[];
};

type Candidate = {
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string | null;
  canonicalId?: string;
  discoveryUrl?: string;
  sourceMaterial?: string;
  rankingWeek?: string;
  weeklyRank?: number;
  weeklyUpvotes?: number;
  sourceName?: string;
  publisher?: string;
};

type SicEditorial = {
  id: string;
  translatedTitle: string;
  description: string;
  contentSummary: string;
};

export type SicRawContentItem = SicContentItem & {
  sourceMaterial?: string;
};

function text(value: unknown, limit: number) {
  return decodeHtmlEntities(String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function structuredText(value: unknown, limit: number) {
  const source = String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/\r\n?/g, "\n");
  if (!/<[^>]+>/.test(source)) {
    return decodeHtmlEntities(source)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
      .split("\n")
      .map((lineValue) => lineValue.replace(/[ \t]+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, limit);
  }
  const block = "\uE000";
  const line = "\uE001";
  const inline = "\uE002";
  return decodeHtmlEntities(source
    .replace(/<br\b[^>]*>/gi, line)
    .replace(/<li\b[^>]*>/gi, `${line}- `)
    .replace(/<\/li>/gi, "")
    .replace(/<\/?(?:p|div|section|article|h[1-6]|ul|ol|pre|blockquote)\b[^>]*>/gi, block)
    .replace(/<\/span>\s*<span\b[^>]*>/gi, inline)
    .replace(/<[^>]+>/g, ""))
    .replace(new RegExp(`(.)${inline}(.)`, "g"), (_match, left: string, right: string) => (
      /^[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9@#]$/.test(right)
        ? `${left} ${right}`
        : `${left}${right}`
    ))
    .replace(/\s+/g, " ")
    .replace(new RegExp(` *${block}+ *`, "g"), "\n\n")
    .replace(new RegExp(` *${line} *`, "g"), "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

function validDate(value: unknown) {
  const source = String(value ?? "").trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(source)
    || /^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(source)
    ? `${source} UTC`
    : source;
  const milliseconds = Date.parse(normalized);
  return Number.isNaN(milliseconds) ? null : new Date(milliseconds).toISOString();
}

function isoWeek(value: string | Date) {
  const source = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(source.getTime())) throw new Error("无法为 Hugging Face 论文计算 ISO 周。");
  const date = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function huggingFaceWeeklyEndpoint(source: SicSource, collectedAt: string, page = 0) {
  const endpoint = new URL(source.endpoint);
  endpoint.searchParams.set("week", isoWeek(collectedAt));
  endpoint.searchParams.set("sort", "publishedAt");
  endpoint.searchParams.set("limit", "100");
  endpoint.searchParams.set("p", String(page));
  return endpoint.toString();
}

function hasCurrentEditorial(item: Partial<SicContentItem>) {
  return item.editorialLocale === "zh-CN"
    && item.editorialVersion === 1
    && Boolean(item.translatedTitle && item.description && item.contentSummary);
}

function editorialItems(value: unknown, expectedIds: Set<string>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const entries = (value as { items?: unknown }).items;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry): SicEditorial[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const id = text(item.id, 80);
    const translatedTitle = text(item.translatedTitle, 90);
    const description = text(item.description, 140);
    const contentSummary = text(item.contentSummary, 520);
    if (!expectedIds.has(id) || !translatedTitle || !description || !contentSummary) return [];
    return [{ id, translatedTitle, description, contentSummary }];
  });
}

async function enrichItems(
  items: SicRawContentItem[],
  options: { requireCompleteEditorial?: boolean; editorialDeadlineAt?: number } = {},
) {
  const stored = await getSicStoredContent();
  const previousByIdentity = new Map(stored.items.map((item) => [sicContentIdentityKey(item), item]));
  const retained = items.map((item) => {
    const previous = previousByIdentity.get(sicContentIdentityKey(item));
    const previousEditorial = previous && hasCurrentEditorial(previous) ? previous : undefined;
    return {
      ...item,
      translatedTitle: item.translatedTitle ?? previousEditorial?.translatedTitle,
      description: item.description ?? previousEditorial?.description,
      contentSummary: item.contentSummary ?? previousEditorial?.contentSummary,
      editorialLocale: item.editorialLocale ?? previousEditorial?.editorialLocale,
      editorialVersion: item.editorialVersion ?? previousEditorial?.editorialVersion,
    };
  });
  const pending = retained.filter((item) => !hasCurrentEditorial(item));
  if (pending.length === 0) return retained;

  let client: ReturnType<typeof createEditorialProfileClient>;
  try {
    client = createEditorialProfileClient(loadEditorialProfileConfig("sic_editorial"));
  } catch (error) {
    if (options.requireCompleteEditorial || isEditorialInfrastructureError(error)) throw error;
    return retained;
  }

  const materialById = new Map<string, string>();
  let nextMaterial = 0;
  const materialWorker = async () => {
    while (nextMaterial < pending.length) {
      const item = pending[nextMaterial];
      nextMaterial += 1;
      materialById.set(item.id, structuredText(item.sourceMaterial || item.summary, 12_000));
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, materialWorker));

  const editorialById = new Map<string, SicEditorial>();
  const assertEditorialDeadline = () => {
    if (options.editorialDeadlineAt !== undefined && Date.now() >= options.editorialDeadlineAt) {
      throw new EditorialInfrastructureError(
        "SiC 编辑已达到本轮时间预算；剩余内容交给 inbox 退避重试。",
        "MODEL_RUN_DEADLINE_EXCEEDED",
      );
    }
  };
  const requestEditorialBatch = async (batch: typeof pending) => {
    const complete = () => {
      assertEditorialDeadline();
      return client.completeJson({
        task: "sic-latest-source-editorial",
        schemaVersion: "1",
        instruction: [
          "为每条固定来源的最新更新生成面向普通技术读者的中文编辑结果。",
          "输出 JSON：{\"items\":[{\"id\":\"...\",\"translatedTitle\":\"简洁准确的中文标题\",\"description\":\"一句话说明这次更新讲什么\",\"contentSummary\":\"两到三句话概括核心内容、方法或讨论重点\"}]}。",
          "保留产品名、模型名和必要英文术语；不得补造原始资料没有的结论。translatedTitle 不超过 36 个汉字，description 不超过 70 个汉字，contentSummary 不超过 220 个汉字。",
        ].join("\n"),
        input: batch.map((item) => ({
          id: item.id,
          group: item.group,
          sourceName: item.sourceName,
          originalTitle: item.title,
          sourceSummary: item.summary,
          sourceMaterial: materialById.get(item.id) || item.summary,
          publishedAt: item.publishedAt,
        })),
      });
    };
    try {
      return await complete();
    } catch (error) {
      if (isFatalEditorialInfrastructureError(error)) throw error;
      assertEditorialDeadline();
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      return complete();
    }
  };
  const recoverEditorialBatch = async (batch: typeof pending): Promise<SicEditorial[]> => {
    try {
      const results = editorialItems(
        await requestEditorialBatch(batch),
        new Set(batch.map((item) => item.id)),
      );
      const completedIds = new Set(results.map((item) => item.id));
      const missing = batch.filter((item) => !completedIds.has(item.id));
      if (missing.length === 0) return results;
      if (missing.length < batch.length) return [...results, ...await recoverEditorialBatch(missing)];
    } catch (error) {
      if (isFatalEditorialInfrastructureError(error)) throw error;
      if (batch.length === 1) {
        console.error("SiC 编辑降级到单条后仍失败。", {
          id: batch[0].id,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    }
    const midpoint = Math.ceil(batch.length / 2);
    return [
      ...await recoverEditorialBatch(batch.slice(0, midpoint)),
      ...await recoverEditorialBatch(batch.slice(midpoint)),
    ];
  };
  const configuredBatchSize = Number(
    process.env.VAULT2077_SIC_LLM_BATCH_ITEMS
    ?? process.env.VAULT2077_LLM_BATCH_ITEMS
    ?? "3",
  );
  const batchSize = Number.isFinite(configuredBatchSize)
    ? Math.max(1, Math.min(8, Math.floor(configuredBatchSize)))
    : 3;
  const configuredConcurrency = Number(
    process.env.VAULT2077_SIC_LLM_CONCURRENCY
    ?? process.env.VAULT2077_LLM_CONCURRENCY
    ?? "1",
  );
  const concurrency = Number.isFinite(configuredConcurrency)
    ? Math.max(1, Math.min(4, Math.floor(configuredConcurrency)))
    : 1;
  const batches = Array.from(
    { length: Math.ceil(pending.length / batchSize) },
    (_, index) => pending.slice(index * batchSize, (index + 1) * batchSize),
  );
  let nextBatch = 0;
  const editorialWorker = async () => {
    while (nextBatch < batches.length) {
      const batch = batches[nextBatch];
      nextBatch += 1;
      for (const editorial of await recoverEditorialBatch(batch)) {
        editorialById.set(editorial.id, editorial);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, editorialWorker));
  if (options.requireCompleteEditorial) {
    const missing = pending.filter((item) => !editorialById.has(item.id));
    if (missing.length > 0) throw new Error(`SiC 境内 LLM 缺少 ${missing.length} 条编辑结果。`);
  }
  return retained.map((item) => {
    const editorial = editorialById.get(item.id);
    return editorial ? {
      ...item,
      ...editorial,
      editorialLocale: "zh-CN" as const,
      editorialVersion: 1,
    } : item;
  });
}


function approvedOrigins(source: SicSource) {
  return new Set([
    new URL(source.homeUrl).origin,
    new URL(source.endpoint).origin,
    ...(source.allowedRedirectOrigins ?? []),
  ]);
}

function allowedUrl(raw: string, source: SicSource) {
  try {
    const candidate = new URL(raw, source.homeUrl);
    if (
      candidate.protocol !== "https:"
      || candidate.username
      || candidate.password
      || (source.kind !== "trusted_feed_json" && !approvedOrigins(source).has(candidate.origin))
    ) return null;
    candidate.hash = "";
    if (candidate.hostname === "developers.google.com") candidate.searchParams.delete("hl");
    return candidate.toString();
  } catch {
    return null;
  }
}

function tagValue(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? text(match[1], 12_000) : "";
}

function structuredTagValue(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? structuredText(match[1], 12_000) : "";
}

function atomLink(block: string) {
  const match = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  return match?.[1] ?? tagValue(block, "link");
}

function xmlEntries(source: SicSource, payload: string): Candidate[] {
  const blocks = [...payload.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  return blocks.flatMap((block) => {
    if (
      source.id === "latent-space-podcast"
      && !/<enclosure\b[^>]*(?:type=["']audio\/|url=["'][^"']+\.(?:mp3|m4a))/i.test(block)
      && !/<media:content\b[^>]*(?:medium=["']audio|type=["']audio\/)/i.test(block)
    ) return [];
    const url = allowedUrl(atomLink(block), source);
    const title = tagValue(block, "title");
    if (!url || !title) return [];
    const summary = tagValue(block, "content:encoded")
      || tagValue(block, "description")
      || tagValue(block, "summary")
      || tagValue(block, "content")
      || tagValue(block, "media:description");
    const sourceMaterial = structuredTagValue(block, "content:encoded")
      || structuredTagValue(block, "description")
      || structuredTagValue(block, "summary")
      || structuredTagValue(block, "content")
      || structuredTagValue(block, "media:description");
    return [{
      title,
      url,
      summary,
      sourceMaterial,
      publishedAt: validDate(tagValue(block, "pubDate") || tagValue(block, "published") || tagValue(block, "updated")),
    }];
  });
}

function jsonObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(jsonObjects);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(jsonObjects)];
}

function jsonLdEntries(source: SicSource, payload: string): Candidate[] {
  const blocks = [...payload.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  const candidates: Candidate[] = [];
  for (const block of blocks) {
    try {
      for (const item of jsonObjects(JSON.parse(block))) {
        const title = text(item.headline ?? item.name, 500);
        const url = allowedUrl(String(item.url ?? item.mainEntityOfPage ?? ""), source);
        if (!title || !url) continue;
        candidates.push({
          title,
          url,
          summary: text(item.description ?? item.abstract, 1_400),
          publishedAt: validDate(item.datePublished ?? item.dateModified ?? item.uploadDate),
        });
      }
    } catch {
      // A malformed JSON-LD block is not a reason to discard a whole official source.
    }
  }
  return candidates;
}

function anchorEntries(source: SicSource, payload: string): Candidate[] {
  const candidates: Candidate[] = [];
  for (const match of payload.matchAll(/<a\b([^>]*\bhref=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi)) {
    const url = allowedUrl(match[2], source);
    const title = text(match[3], 500);
    if (!url || !title || title.length < 4) continue;
    const path = new URL(url).pathname.toLowerCase();
    const homePath = new URL(source.homeUrl).pathname.replace(/\/$/, "").toLowerCase();
    const admitted = source.id === "google-ml-courses"
        ? path.startsWith("/machine-learning/") && path !== homePath
        : source.id === "nvidia-deep-learning-institute"
          ? path.includes("/training/") && path !== homePath
          : source.id === "google-deepmind-podcast"
            ? path.startsWith("/the-podcast/") && path !== homePath
            : false;
    if (!admitted || path === homePath || /^(about|careers|contact|privacy|terms|research|products|learn|developers?)$/i.test(title)) continue;
    candidates.push({ title, url });
  }
  return candidates;
}

function datedIndexEntries(source: SicSource, payload: string): Candidate[] {
  const headings = [...payload.matchAll(/<h([2-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const candidates = headings.flatMap((heading, index) => {
    const headingText = text(heading[2], 160);
    const publishedAt = validDate(headingText);
    if (!publishedAt) return [];
    const start = (heading.index ?? 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? payload.length;
    const rawMaterial = payload.slice(start, end);
    const summary = text(rawMaterial, 1_400);
    const sourceMaterial = structuredText(rawMaterial, 12_000);
    if (!summary) return [];
    const firstSentence = summary.split(/(?<=[。！？.!?])\s+/)[0];
    return [{
      title: text(firstSentence || `${source.name} ${headingText}`, 240),
      url: source.homeUrl,
      summary,
      sourceMaterial,
      publishedAt,
    }];
  });
  return candidates
    .sort((left, right) => Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? ""));
}

function dedupe(candidates: Candidate[]) {
  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = candidate.canonicalId ?? candidate.url;
    if (!unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()]
    .sort((left, right) => {
      if (left.weeklyRank && right.weeklyRank) return left.weeklyRank - right.weeklyRank;
      return Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? "");
    });
}

function selectCandidates(
  candidates: Candidate[],
  windowFrom: string | undefined,
  runMode: "incremental" | "bootstrap",
) {
  const filtered = dedupe(candidates).filter((candidate) => (
    !windowFrom
    || !candidate.publishedAt
    || Date.parse(candidate.publishedAt) >= Date.parse(windowFrom)
  ));
  if (runMode !== "bootstrap") return filtered;
  return filtered
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.candidate.publishedAt ?? "");
      const rightTime = Date.parse(right.candidate.publishedAt ?? "");
      const normalizedLeft = Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY;
      const normalizedRight = Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY;
      return normalizedRight - normalizedLeft || left.index - right.index;
    })
    .slice(0, 1)
    .map(({ candidate }) => candidate);
}

function completeCandidates(candidates: Candidate[]) {
  return candidates.filter((candidate) => Boolean(candidate.summary && candidate.sourceMaterial));
}

function followBuildersJsonEntries(source: SicSource, payload: string): Candidate[] {
  let root: Record<string, unknown>;
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
    root = parsed as Record<string, unknown>;
  } catch {
    return [];
  }
  const collection = source.group === "podcasts" ? "podcasts" : "blogs";
  const expectedLookback = source.group === "podcasts" ? 336 : 72;
  if (root.lookbackHours !== expectedLookback || !Array.isArray(root[collection])) return [];
  if (root[collection].length > 500) throw new Error("Follow Builders feed exceeds the protocol safety limit.");
  return root[collection].flatMap((entry): Candidate[] => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const url = allowedUrl(String(item.url ?? ""), source);
    const title = text(item.title, 500);
    const sourceName = text(item.name ?? item.source, 180);
    const rawMaterial = source.group === "podcasts" ? item.transcript : item.content;
    const sourceMaterial = structuredText(rawMaterial, 12_000);
    const summary = text(item.description, 1_400) || text(rawMaterial, 1_400);
    if (!url || !title || !sourceName || !sourceMaterial || !summary) return [];
    const upstreamId = source.group === "podcasts"
      ? text(item.guid ?? url, 500)
      : url;
    return [{
      title,
      url,
      summary,
      sourceMaterial,
      sourceName,
      publisher: sourceName,
      canonicalId: `${source.group === "podcasts" ? "follow-builders-podcast" : "follow-builders-blog"}:${upstreamId}`,
      publishedAt: validDate(item.publishedAt),
    }];
  });
}

function candidatePassesAdmission(source: SicSource, candidate: Pick<Candidate, "title">) {
  return !(source.excludedTitlePatterns ?? []).some((pattern) => (
    new RegExp(pattern, "iu").test(candidate.title)
  ));
}

function arxivId(value: unknown) {
  const match = String(value ?? "").match(/(?:arxiv\.org\/abs\/)?(\d{4}\.\d{4,5})(?:v\d+)?/i);
  return match?.[1] ?? null;
}

function huggingFacePaperRecords(payload: string): Array<{
  id: string;
  discoveryUrl: string;
  submittedAt?: string;
  upvotes: number;
}> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return [];
  }
  const records = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { papers?: unknown }).papers)
      ? (parsed as { papers: unknown[] }).papers
      : [];
  return records.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const outer = entry as Record<string, unknown>;
    const paper = outer.paper && typeof outer.paper === "object"
      ? outer.paper as Record<string, unknown>
      : outer;
    const id = arxivId(paper.id ?? paper.arxivId ?? outer.id);
    if (!id) return [];
    const submittedAt = validDate(
      paper.submittedOnDailyAt
      ?? outer.submittedOnDailyAt
      ?? outer.publishedAt,
    );
    const rawUpvotes = Number(paper.upvotes ?? outer.upvotes ?? 0);
    return [{
      id,
      discoveryUrl: `https://huggingface.co/papers/${id}`,
      ...(submittedAt ? { submittedAt } : {}),
      upvotes: Number.isFinite(rawUpvotes) ? Math.max(0, Math.floor(rawUpvotes)) : 0,
    }];
  });
}

type HuggingFacePaperDiscovery = ReturnType<typeof huggingFacePaperRecords>[number] & {
  rankingWeek: string;
  weeklyRank: number;
};

function rankHuggingFacePaperRecords(
  records: ReturnType<typeof huggingFacePaperRecords>,
  rankingWeek: string,
) {
  return [...records]
    .sort((left, right) => (
      right.upvotes - left.upvotes
      || Date.parse(right.submittedAt ?? "") - Date.parse(left.submittedAt ?? "")
      || left.id.localeCompare(right.id)
    ))
    .map((record, index): HuggingFacePaperDiscovery => ({
      ...record,
      rankingWeek,
      weeklyRank: index + 1,
    }));
}

function arxivEntries(payload: string, discoveries: Map<string, HuggingFacePaperDiscovery>): Candidate[] {
  const blocks = [...payload.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  return blocks.flatMap((block) => {
    const id = arxivId(tagValue(block, "id"));
    const title = tagValue(block, "title");
    const summary = tagValue(block, "summary");
    const sourceMaterial = structuredTagValue(block, "summary");
    const discovery = id ? discoveries.get(id) : undefined;
    if (!id || !title || !summary || !discovery) return [];
    return [{
      canonicalId: `arxiv:${id}`,
      discoveryUrl: discovery.discoveryUrl,
      url: `https://arxiv.org/abs/${id}`,
      title,
      summary,
      sourceMaterial,
      publishedAt: validDate(tagValue(block, "published") || tagValue(block, "updated")),
      rankingWeek: discovery.rankingWeek,
      weeklyRank: discovery.weeklyRank,
      weeklyUpvotes: discovery.upvotes,
    }];
  });
}

function arxivQueryUrls(ids: string[]) {
  return ["https://export.arxiv.org", "https://arxiv.org"].map((origin) => {
    const query = new URL("/api/query", origin);
    query.searchParams.set("id_list", ids.join(","));
    query.searchParams.set("max_results", String(ids.length));
    return query.toString();
  });
}

async function collectArxivBatch(
  source: SicSource,
  fetcher: Fetcher,
  ids: string[],
  discoveries: Map<string, HuggingFacePaperDiscovery>,
) {
  const failures: string[] = [];
  for (const endpoint of arxivQueryUrls(ids)) {
    try {
      const verified = await fetchText(fetcher, endpoint, source, {
        timeoutMs: 30_000,
        attempts: 1,
      });
      return arxivEntries(verified, discoveries);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "请求失败");
    }
  }
  throw new Error(`arXiv 官方 API 均暂时不可用：${failures.join("；").slice(0, 240)}`);
}

async function collectHuggingFacePapers(
  source: SicSource,
  fetcher: Fetcher,
  firstPayload: string,
  firstEndpoint: string,
) {
  const recordsById = new Map<string, ReturnType<typeof huggingFacePaperRecords>[number]>();
  let payload = firstPayload;
  for (let page = 0; page < 20; page += 1) {
    const records = huggingFacePaperRecords(payload);
    const sizeBeforePage = recordsById.size;
    for (const record of records) recordsById.set(record.id, record);
    if (records.length < 100 || (page > 0 && recordsById.size === sizeBeforePage)) break;
    const nextEndpoint = new URL(firstEndpoint);
    nextEndpoint.searchParams.set("p", String(page + 1));
    payload = await fetchText(fetcher, nextEndpoint.toString(), source);
  }
  const rankingWeek = new URL(firstEndpoint).searchParams.get("week") ?? "";
  const ranked = rankHuggingFacePaperRecords([...recordsById.values()], rankingWeek);
  const discoveries = new Map<string, HuggingFacePaperDiscovery>(ranked.map((record) => [
    record.id,
    record,
  ]));
  const ids = [...discoveries.keys()];
  const candidates: Candidate[] = [];
  for (let offset = 0; offset < ids.length; offset += 20) {
    if (offset > 0) await new Promise((resolve) => setTimeout(resolve, 3_200));
    const batchIds = ids.slice(offset, offset + 20);
    candidates.push(...await collectArxivBatch(source, fetcher, batchIds, discoveries));
  }
  return candidates;
}

function sitemapUrls(source: SicSource, payload: string, windowFrom?: string): Candidate[] {
  const scope = new URL(source.homeUrl).pathname.replace(/\/$/, "");
  const candidates: Candidate[] = [];
  for (const block of payload.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const url = allowedUrl(tagValue(block[1], "loc"), source);
    const path = url ? new URL(url).pathname.replace(/\/$/, "") : "";
    if (!url || path === scope || !path.startsWith(`${scope}/`)) continue;
    candidates.push({ title: "", url, publishedAt: validDate(tagValue(block[1], "lastmod")) });
  }
  return dedupe(candidates).filter((candidate) => (
    !windowFrom
    || !candidate.publishedAt
    || Date.parse(candidate.publishedAt) >= Date.parse(windowFrom)
  ));
}

function githubCommitEntries(source: SicSource, payload: string): Candidate[] {
  try {
    const commits = JSON.parse(payload) as Array<Record<string, unknown>>;
    if (!Array.isArray(commits)) return [];
    return commits.flatMap((item) => {
      const commit = item.commit as Record<string, unknown> | undefined;
      const url = allowedUrl(String(item.html_url ?? ""), source);
      const material = structuredText(commit?.message, 12_000);
      const title = text(material, 500).split("\n")[0];
      if (!url || !title) return [];
      const author = commit?.author as Record<string, unknown> | undefined;
      return [{ title, url, summary: text(material, 1_400), sourceMaterial: material, publishedAt: validDate(author?.date) }];
    });
  } catch {
    return [];
  }
}

function pageMetadata(source: SicSource, payload: string, url: string): Candidate | null {
  const property = (name: string) => {
    const expression = new RegExp(`<meta\\b[^>]*(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
    return text(payload.match(expression)?.[1], 1_400);
  };
  const title = property("og:title") || text(payload.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 500);
  const resolved = allowedUrl(property("og:url") || url, source);
  if (!title || !resolved) return null;
  return {
    title,
    url: resolved,
    summary: property("og:description") || property("description"),
    publishedAt: validDate(property("article:published_time") || property("date")),
  };
}

async function fetchText(
  fetcher: Fetcher,
  url: string,
  source: SicSource,
  options: SourceFetchOptions = {},
) {
  const requested = new URL(url);
  if (!approvedOrigins(source).has(requested.origin)) throw new Error("请求地址不属于获批来源域名。");
  const { response, text: payload } = await fetchTextBounded(
    url,
    {
      headers: {
        Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html, application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Vault2077-SiC-Collector/1.0",
      },
      redirect: "follow",
    },
    { fetcher, timeoutMs: 20_000, maxBytes: 8 * 1024 * 1024, ...options },
  );
  const final = new URL(response.url || url);
  if (final.protocol !== "https:" || !approvedOrigins(source).has(final.origin)) {
    throw new Error("上游重定向离开了获批域名。");
  }
  return payload;
}

type SicSourceAdapterContext = {
  source: SicSource;
  fetcher: Fetcher;
  payload: string;
  endpoint: string;
  collectedAt: string;
  windowFrom?: string;
  runMode: "incremental" | "bootstrap";
};

type SicSourceCollector = (context: SicSourceAdapterContext) => Promise<Candidate[]>;

const sicSourceCollectors: Record<SicSourceAdapterId, SicSourceCollector> = {
  "hugging-face-weekly": ({ source, fetcher, payload, endpoint }) => collectHuggingFacePapers(source, fetcher, payload, endpoint),
  "trusted-json-feed": async ({ source, payload, collectedAt }) => {
    const parsed = JSON.parse(payload) as { generatedAt?: unknown };
    const generatedAt = validDate(parsed.generatedAt);
    const staleHours = source.group === "podcasts" ? 360 : 96;
    if (!generatedAt || Date.parse(generatedAt) < Date.parse(collectedAt) - staleHours * 60 * 60 * 1000) {
      throw new Error(`Follow Builders ${source.group} feed is stale or missing generatedAt.`);
    }
    return followBuildersJsonEntries(source, payload);
  },
  "xml-feed": async ({ source, payload }) => xmlEntries(source, payload),
  "github-commit-feed": async ({ source, payload }) => githubCommitEntries(source, payload),
  sitemap: async ({ source, fetcher, payload, windowFrom, runMode }) => {
    const pages = selectCandidates(sitemapUrls(source, payload, windowFrom), windowFrom, runMode);
    const details = await Promise.all(pages.map(async (page) => {
      try {
        return pageMetadata(source, await fetchText(fetcher, page.url, source), page.url) ?? page;
      } catch {
        return page;
      }
    }));
    return details.filter((item) => item.title);
  },
  "dated-index": async ({ source, payload }) => [...datedIndexEntries(source, payload), ...jsonLdEntries(source, payload)],
  "generic-html": async ({ source, payload }) => [...jsonLdEntries(source, payload), ...anchorEntries(source, payload)],
};

async function collectSource(
  source: SicSource,
  fetcher: Fetcher,
  collectedAt: string,
  runMode: "incremental" | "bootstrap",
) {
  const endpoint = source.id === "hugging-face-daily-papers"
    ? huggingFaceWeeklyEndpoint(source, collectedAt)
    : source.endpoint;
  const payload = await fetchText(
    fetcher,
    endpoint,
    source,
    source.kind === "official_channel"
      ? { retryStatuses: [404], retryDelayMs: 1_000 }
      : {},
  );
  const windowFrom = runMode === "bootstrap"
    ? undefined
    : new Date(Date.parse(collectedAt) - SIC_LOOKBACK_MS).toISOString();
  const adapter: SicSourceAdapterId = resolveSicSourceAdapter(source);
  const candidates = await sicSourceCollectors[adapter]({
    source,
    fetcher,
    payload,
    endpoint,
    collectedAt,
    windowFrom,
    runMode,
  });
  const admittedCandidates = completeCandidates(
    candidates.filter((candidate) => candidatePassesAdmission(source, candidate)),
  );
  const selectedCandidates = source.id === "hugging-face-daily-papers" || source.kind === "trusted_feed_json"
    ? dedupe(admittedCandidates)
    : selectCandidates(admittedCandidates, windowFrom, runMode);
  const items: SicRawContentItem[] = selectedCandidates.map((candidate) => ({
    id: createHash("sha256").update(candidate.canonicalId ?? `${source.id}:${candidate.url}`).digest("hex"),
    sourceId: source.id,
    group: source.group,
    sourceName: candidate.sourceName || source.name,
    publisher: candidate.publisher || source.publisher,
    title: candidate.title,
    summary: candidate.summary as string,
    url: candidate.url,
    publishedAt: candidate.publishedAt ?? null,
    collectedAt,
    canonicalId: candidate.canonicalId,
    discoveryUrl: candidate.discoveryUrl,
    rankingWeek: candidate.rankingWeek,
    weeklyRank: candidate.weeklyRank,
    weeklyUpvotes: candidate.weeklyUpvotes,
    provenanceStatus: candidate.canonicalId ? "verified" : "declared",
    sourceMaterial: candidate.sourceMaterial,
  }));
  return { items, materialFailures: 0 };
}

export type SicRawCollection = {
  version: 1;
  snapshotId?: string;
  collectedAt: string;
  items: SicRawContentItem[];
  reports: SicSourceCollectionReport[];
};

export async function collectSicRawContent(
  fetcher: Fetcher = fetch,
  options: {
    allowAllFailed?: boolean;
    sourceIds?: string[];
    runMode?: "incremental" | "bootstrap";
  } = {},
): Promise<SicRawCollection> {
  const collectedAt = new Date().toISOString();
  const requested = new Set(options.sourceIds ?? []);
  const sources = listCollectableSicSources().filter((source) => (
    requested.size === 0 || requested.has(source.id)
  ));
  const collectOutcome = async (source: SicSource) => {
    try {
      const outcome = await collectSource(source, fetcher, collectedAt, options.runMode ?? "incremental");
      const bootstrapEmpty = options.runMode === "bootstrap" && outcome.items.length === 0;
      const status = bootstrapEmpty
        ? "failure"
        : outcome.items.length === 0
          ? "empty"
        : outcome.materialFailures > 0
          ? "partial"
          : "success";
      return {
        items: outcome.items,
        report: {
          sourceId: source.id,
          status,
          collectedAt,
          itemCount: outcome.items.length,
          ...(bootstrapEmpty
            ? { error: "初始化回填未找到符合来源准入边界的最近内容。" }
            : outcome.materialFailures > 0
            ? { error: `${outcome.materialFailures} 条原页材料获取失败，已保留来源摘要。` }
            : {}),
        } satisfies SicSourceCollectionReport,
      };
    } catch (error) {
      return {
        items: [],
        report: {
          sourceId: source.id,
          status: "failure",
          collectedAt,
          itemCount: 0,
          error: error instanceof Error ? error.message.slice(0, 240) : "来源暂时不可用。",
        } satisfies SicSourceCollectionReport,
      };
    }
  };
  const outcomes: Awaited<ReturnType<typeof collectOutcome>>[] = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < sources.length) {
      const index = nextIndex;
      nextIndex += 1;
      outcomes[index] = await collectOutcome(sources[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SOURCE_CONCURRENCY, sources.length) }, worker));
  const items = outcomes.flatMap((outcome) => outcome.items);
  const reports = outcomes.map((outcome) => outcome.report);
  if (!options.allowAllFailed && reports.length > 0 && reports.every((report) => report.status === "failure")) {
    throw new Error("所有 SiC 固定来源均暂时不可用。 ");
  }
  return { version: 1, collectedAt, items, reports };
}

function validateRawCollection(value: unknown, options: {
  enforceAge: boolean;
  requireCompleteReports: boolean;
}): SicRawCollection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SiC 境外采集包格式无效。");
  const packet = value as Partial<SicRawCollection>;
  if (packet.version !== 1 || !validDate(packet.collectedAt) || !Array.isArray(packet.items) || !Array.isArray(packet.reports)) {
    throw new Error("SiC 境外采集包格式无效。");
  }
  const collectedAt = validDate(packet.collectedAt) as string;
  if (options.enforceAge && Math.abs(Date.now() - Date.parse(collectedAt)) > 48 * 60 * 60 * 1000) {
    throw new Error("SiC 境外采集包已过期。");
  }
  if (packet.items.length > 2_000 || packet.reports.length > 200) throw new Error("SiC 境外采集包超过数量限制。");
  const sources = new Map(listCollectableSicSources().map((source) => [source.id, source]));
  const items = packet.items.flatMap((raw): SicRawContentItem[] => {
    if (!raw || typeof raw !== "object") return [];
    const source = sources.get(text(raw.sourceId, 180));
    if (!source) return [];
    const url = allowedUrl(String(raw.url ?? ""), source);
    const title = text(raw.title, 500);
    const summary = text(raw.summary, 1_400);
    const sourceMaterial = structuredText(raw.sourceMaterial, 12_000);
    if (!url || !title || !summary || !sourceMaterial) return [];
    return [{
      id: createHash("sha256").update(text(raw.canonicalId, 180) || `${source.id}:${url}`).digest("hex"),
      sourceId: source.id,
      group: source.group,
      sourceName: source.kind === "trusted_feed_json" ? text(raw.sourceName, 180) : source.name,
      publisher: source.kind === "trusted_feed_json" ? text(raw.publisher, 180) : source.publisher,
      title,
      summary,
      sourceMaterial,
      url,
      publishedAt: validDate(raw.publishedAt),
      collectedAt,
      canonicalId: text(raw.canonicalId, 180) || undefined,
      discoveryUrl: allowedUrl(String(raw.discoveryUrl ?? ""), source) ?? undefined,
      rankingWeek: /^\d{4}-W\d{2}$/.test(text(raw.rankingWeek, 8)) ? text(raw.rankingWeek, 8) : undefined,
      weeklyRank: Number.isInteger(raw.weeklyRank) && Number(raw.weeklyRank) > 0 ? Number(raw.weeklyRank) : undefined,
      weeklyUpvotes: Number.isInteger(raw.weeklyUpvotes) && Number(raw.weeklyUpvotes) >= 0 ? Number(raw.weeklyUpvotes) : undefined,
      provenanceStatus: text(raw.canonicalId, 180) ? "verified" as const : "declared" as const,
    }];
  });
  const reportBySource = new Map(packet.reports.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const sourceId = text(raw.sourceId, 180);
    if (!sources.has(sourceId)) return [];
    const status = ["success", "partial", "empty", "failure"].includes(raw.status) ? raw.status : "failure";
    return [[sourceId, {
      sourceId,
      status,
      collectedAt,
      itemCount: Math.max(0, Number(raw.itemCount) || 0),
      ...(raw.error ? { error: text(raw.error, 240) } : {}),
    } satisfies SicSourceCollectionReport] as const];
  }));
  const reports = options.requireCompleteReports
    ? [...sources.keys()].map((sourceId) => reportBySource.get(sourceId) ?? ({
      sourceId,
      status: "failure" as const,
      collectedAt,
      itemCount: 0,
      error: "境外采集包缺少该来源报告。",
    }))
    : [...reportBySource.values()];
  return {
    version: 1,
    snapshotId: text(packet.snapshotId, 180) || undefined,
    collectedAt,
    items,
    reports,
  };
}

export async function ingestSicAcquisitionContent(
  value: unknown,
  _fetcher: Fetcher,
  options: { activeSourceIds?: string[]; editorialDeadlineAt?: number; runMode?: "bootstrap" | "incremental" } = {},
) {
  const packet = validateRawCollection(value, { enforceAge: false, requireCompleteReports: false });
  const enriched = await enrichItems(packet.items, { editorialDeadlineAt: options.editorialDeadlineAt });
  const items = enriched
    .filter(hasCurrentEditorial)
    .map(({ sourceMaterial: _sourceMaterial, ...item }) => item as SicContentItem);
  const publishedBySource = new Map<string, number>();
  for (const item of items) publishedBySource.set(item.sourceId, (publishedBySource.get(item.sourceId) ?? 0) + 1);
  const reports = packet.reports.map((report) => {
    const published = publishedBySource.get(report.sourceId) ?? 0;
    if (report.itemCount > published && published > 0) {
      return { ...report, status: "partial" as const, error: `境内编辑仅完成 ${published}/${report.itemCount} 条。` };
    }
    if (report.itemCount > 0 && published === 0) {
      return { ...report, status: "failure" as const, error: "境内编辑未完成该来源任何记录；继续保留上一成功快照。" };
    }
    return report;
  });
  return mergeSicStoredContent({
    items,
    reports,
    updatedAt: packet.collectedAt,
    snapshotId: packet.snapshotId,
    activeSourceIds: options.activeSourceIds ?? listCollectableSicSources().map((source) => source.id),
    runMode: options.runMode,
  });
}

export const sicCollectorTestUtils = {
  xmlEntries,
  sitemapUrls,
  jsonLdEntries,
  anchorEntries,
  datedIndexEntries,
  huggingFacePaperRecords,
  arxivEntries,
  arxivQueryUrls,
  collectArxivBatch,
  rankHuggingFacePaperRecords,
  selectCandidates,
  completeCandidates,
  candidatePassesAdmission,
  followBuildersJsonEntries,
  isoWeek,
  huggingFaceWeeklyEndpoint,
};
