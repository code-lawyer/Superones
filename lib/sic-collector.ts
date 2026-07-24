import "server-only";

import { createHash } from "node:crypto";
import { createOpenAICompatibleClient, loadOpenAICompatibleConfig } from "./openai-compatible-client.ts";
import { fetchTextBounded } from "./sic-fetch.ts";
import { listApprovedSicSources, type SicSource } from "./sic-source-registry.ts";
import { getSicStoredContent, mergeSicStoredContent } from "./sic-content-store.ts";
import type { SicContentItem, SicSourceCollectionReport } from "./sic-content-types.ts";

const MAX_ITEMS_PER_SOURCE = 40;
const MAX_SITEMAP_PAGES = 20;
const SOURCE_CONCURRENCY = 6;

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

type Candidate = {
  title: string;
  url: string;
  summary?: string;
  publishedAt?: string | null;
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
  return String(value ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function readablePageText(payload: string) {
  const withoutNoise = payload
    .replace(/<(script|style|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const primary = withoutNoise.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? withoutNoise;
  return text(primary, 4_000);
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

function itemTimestamp(item: SicContentItem) {
  const value = Date.parse(item.publishedAt ?? item.collectedAt);
  return Number.isNaN(value) ? 0 : value;
}

function latestItemsBySource(items: SicContentItem[]) {
  const seen = new Set<string>();
  return [...items]
    .sort((left, right) => itemTimestamp(right) - itemTimestamp(left))
    .filter((item) => {
      if (seen.has(item.sourceId)) return false;
      seen.add(item.sourceId);
      return true;
    });
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
  fetcher: Fetcher,
  sources: SicSource[],
  options: { requireCompleteEditorial?: boolean } = {},
) {
  const stored = await getSicStoredContent();
  const previousById = new Map(stored.items.map((item) => [item.id, item]));
  const retained = items.map((item) => {
    const previous = previousById.get(item.id);
    return {
      ...item,
      translatedTitle: item.translatedTitle ?? previous?.translatedTitle,
      description: item.description ?? previous?.description,
      contentSummary: item.contentSummary ?? previous?.contentSummary,
    };
  });
  const pending = retained.filter((item) => !item.translatedTitle || !item.description || !item.contentSummary);
  if (pending.length === 0) return retained;

  let client: ReturnType<typeof createOpenAICompatibleClient>;
  try {
    client = createOpenAICompatibleClient(loadOpenAICompatibleConfig());
  } catch (error) {
    if (options.requireCompleteEditorial) throw error;
    return retained;
  }

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const materialById = new Map<string, string>();
  let nextMaterial = 0;
  const materialWorker = async () => {
    while (nextMaterial < pending.length) {
      const item = pending[nextMaterial];
      nextMaterial += 1;
      if (item.sourceMaterial) {
        materialById.set(item.id, text(item.sourceMaterial, 12_000));
        continue;
      }
      const source = sourceById.get(item.sourceId);
      if (!source) continue;
      try {
        const payload = await fetchText(fetcher, item.url, source);
        materialById.set(item.id, readablePageText(payload));
      } catch {
        materialById.set(item.id, item.summary);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, materialWorker));

  const editorialById = new Map<string, SicEditorial>();
  const requestEditorialBatch = async (batch: typeof pending) => {
    const complete = () => client.completeJson({
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
    try {
      return await complete();
    } catch {
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
  for (let start = 0; start < pending.length; start += 3) {
    const batch = pending.slice(start, start + 3);
    for (const editorial of await recoverEditorialBatch(batch)) editorialById.set(editorial.id, editorial);
  }
  if (options.requireCompleteEditorial) {
    const missing = pending.filter((item) => !editorialById.has(item.id));
    if (missing.length > 0) throw new Error(`SiC 境内 LLM 缺少 ${missing.length} 条编辑结果。`);
  }
  return retained.map((item) => {
    const editorial = editorialById.get(item.id);
    return editorial ? { ...item, ...editorial } : item;
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
    if (candidate.protocol !== "https:" || !approvedOrigins(source).has(candidate.origin)) return null;
    candidate.hash = "";
    return candidate.toString();
  } catch {
    return null;
  }
}

function tagValue(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? text(match[1], 12_000) : "";
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
    return [{
      title,
      url,
      summary: tagValue(block, "description") || tagValue(block, "summary") || tagValue(block, "content"),
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
    const admitted = source.id === "hugging-face-daily-papers"
      ? /^\/papers\/[^/]+/.test(path)
      : source.id === "google-ml-courses"
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
    const summary = text(payload.slice(start, end), 1_400);
    if (!summary) return [];
    const firstSentence = summary.split(/(?<=[。！？.!?])\s+/)[0];
    return [{
      title: text(firstSentence || `${source.name} ${headingText}`, 240),
      url: source.homeUrl,
      summary,
      publishedAt,
    }];
  });
  return candidates
    .sort((left, right) => Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? ""))
    .slice(0, 1);
}

function dedupe(candidates: Candidate[]) {
  const unique = new Map<string, Candidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.url)) unique.set(candidate.url, candidate);
  }
  return [...unique.values()]
    .sort((left, right) => Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? ""))
    .slice(0, MAX_ITEMS_PER_SOURCE);
}

function sitemapUrls(source: SicSource, payload: string): Candidate[] {
  const scope = new URL(source.homeUrl).pathname.replace(/\/$/, "");
  const candidates: Candidate[] = [];
  for (const block of payload.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const url = allowedUrl(tagValue(block[1], "loc"), source);
    if (!url || !new URL(url).pathname.startsWith(scope)) continue;
    candidates.push({ title: "", url, publishedAt: validDate(tagValue(block[1], "lastmod")) });
  }
  return dedupe(candidates).slice(0, MAX_SITEMAP_PAGES);
}

function githubCommitEntries(source: SicSource, payload: string): Candidate[] {
  try {
    const commits = JSON.parse(payload) as Array<Record<string, unknown>>;
    if (!Array.isArray(commits)) return [];
    return commits.flatMap((item) => {
      const commit = item.commit as Record<string, unknown> | undefined;
      const url = allowedUrl(String(item.html_url ?? ""), source);
      const title = text(commit?.message, 500).split("\n")[0];
      if (!url || !title) return [];
      const author = commit?.author as Record<string, unknown> | undefined;
      return [{ title, url, summary: source.rationale, publishedAt: validDate(author?.date) }];
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

async function fetchText(fetcher: Fetcher, url: string, source: SicSource) {
  const requested = new URL(url);
  if (!approvedOrigins(source).has(requested.origin)) throw new Error("请求地址不属于获批来源域名。");
  const { response, text: payload } = await fetchTextBounded(
    url,
    {
      headers: { Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml, text/html, application/json", "User-Agent": "Vault2077-SiC-Collector/1.0" },
      redirect: "follow",
    },
    { fetcher, timeoutMs: 20_000, maxBytes: 8 * 1024 * 1024 },
  );
  const final = new URL(response.url || url);
  if (final.protocol !== "https:" || !approvedOrigins(source).has(final.origin)) {
    throw new Error("上游重定向离开了获批域名。");
  }
  return payload;
}

async function collectSource(source: SicSource, fetcher: Fetcher, collectedAt: string) {
  const payload = await fetchText(fetcher, source.endpoint, source);
  let candidates: Candidate[];
  if (["official_rss", "official_atom", "official_channel", "hosted_podcast"].includes(source.kind)) {
    candidates = xmlEntries(source, payload);
  } else if (source.kind === "official_api" && source.id === "dair-ai-papers-of-the-week") {
    candidates = githubCommitEntries(source, payload);
  } else if (source.kind === "official_sitemap") {
    const pages = sitemapUrls(source, payload);
    const details = await Promise.all(pages.map(async (page) => {
      try {
        return pageMetadata(source, await fetchText(fetcher, page.url, source), page.url) ?? page;
      } catch {
        return page;
      }
    }));
    candidates = details.filter((item) => item.title);
  } else if (source.kind === "official_dated_index") {
    candidates = [...datedIndexEntries(source, payload), ...jsonLdEntries(source, payload)];
  } else {
    candidates = [...jsonLdEntries(source, payload), ...anchorEntries(source, payload)];
  }
  const items: SicRawContentItem[] = dedupe(candidates).map((candidate) => ({
    id: createHash("sha256").update(`${source.id}:${candidate.url}`).digest("hex"),
    sourceId: source.id,
    group: source.group,
    sourceName: source.name,
    publisher: source.publisher,
    title: candidate.title,
    summary: candidate.summary || source.rationale,
    url: candidate.url,
    publishedAt: candidate.publishedAt ?? null,
    collectedAt,
  }));
  let materialFailures = 0;
  let nextItem = 0;
  const materialWorker = async () => {
    while (nextItem < items.length) {
      const index = nextItem;
      nextItem += 1;
      const item = items[index];
      try {
        const material = item.url === source.endpoint
          ? readablePageText(payload)
          : readablePageText(await fetchText(fetcher, item.url, source));
        item.sourceMaterial = material || item.summary;
      } catch {
        materialFailures += 1;
        item.sourceMaterial = item.summary;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, materialWorker));
  return { items, materialFailures };
}

export type SicRawCollection = {
  version: 1;
  collectedAt: string;
  items: SicRawContentItem[];
  reports: SicSourceCollectionReport[];
};

export async function collectSicRawContent(
  fetcher: Fetcher = fetch,
  options: { allowAllFailed?: boolean } = {},
): Promise<SicRawCollection> {
  const collectedAt = new Date().toISOString();
  const sources = listApprovedSicSources();
  const collectOutcome = async (source: SicSource) => {
    try {
      const outcome = await collectSource(source, fetcher, collectedAt);
      const status = outcome.items.length === 0
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
          ...(outcome.materialFailures > 0
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
  const sources = new Map(listApprovedSicSources().map((source) => [source.id, source]));
  const items = packet.items.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const source = sources.get(text(raw.sourceId, 180));
    if (!source) return [];
    const url = allowedUrl(String(raw.url ?? ""), source);
    const title = text(raw.title, 500);
    const summary = text(raw.summary, 1_400);
    if (!url || !title) return [];
    return [{
      id: createHash("sha256").update(`${source.id}:${url}`).digest("hex"),
      sourceId: source.id,
      group: source.group,
      sourceName: source.name,
      publisher: source.publisher,
      title,
      summary: summary || source.rationale,
      sourceMaterial: text(raw.sourceMaterial, 12_000) || undefined,
      url,
      publishedAt: validDate(raw.publishedAt),
      collectedAt,
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
  return { version: 1, collectedAt, items, reports };
}

export async function ingestSicRawContent(value: unknown, fetcher: Fetcher = fetch) {
  const packet = validateRawCollection(value, { enforceAge: true, requireCompleteReports: true });
  const sources = listApprovedSicSources();
  const enriched = await enrichItems(packet.items, fetcher, sources);
  const items = enriched.map(({ sourceMaterial: _sourceMaterial, ...item }) => item);
  return mergeSicStoredContent({
    items,
    reports: packet.reports,
    updatedAt: packet.collectedAt,
  });
}

export async function ingestSicAcquisitionContent(value: unknown, fetcher: Fetcher) {
  const packet = validateRawCollection(value, { enforceAge: false, requireCompleteReports: false });
  const sources = listApprovedSicSources();
  const enriched = await enrichItems(packet.items, fetcher, sources, { requireCompleteEditorial: true });
  const items = enriched.map(({ sourceMaterial: _sourceMaterial, ...item }) => item);
  return mergeSicStoredContent({
    items,
    reports: packet.reports,
    updatedAt: packet.collectedAt,
  });
}

export async function refreshSicContent(fetcher: Fetcher = fetch) {
  return ingestSicRawContent(await collectSicRawContent(fetcher), fetcher);
}

export const sicCollectorTestUtils = {
  xmlEntries,
  sitemapUrls,
  jsonLdEntries,
  anchorEntries,
  datedIndexEntries,
};
