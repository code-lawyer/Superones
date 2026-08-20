import "server-only";

import { readFileSync } from "node:fs";

const registry = JSON.parse(readFileSync(new URL("../config/sic-source-registry.json", import.meta.url), "utf8")) as { version: number; sources: unknown[] };

export const SIC_SOURCE_GROUPS = ["papers", "documents", "courses", "podcasts"] as const;
export const SIC_SOURCE_STATUSES = ["pending_review", "approved", "paused", "retired", "rejected"] as const;
export const SIC_SOURCE_KINDS = [
  "official_rss",
  "official_atom",
  "official_sitemap",
  "official_dated_index",
  "official_index",
  "official_catalog",
  "official_channel",
  "official_api",
  "official_repository",
  "hosted_podcast",
  "trusted_feed_json",
] as const;

export type SicSourceGroup = (typeof SIC_SOURCE_GROUPS)[number];
export type SicSourceStatus = (typeof SIC_SOURCE_STATUSES)[number];

export type SicSource = {
  id: string;
  group: SicSourceGroup;
  status: SicSourceStatus;
  statusReason?: string;
  name: string;
  publisher: string;
  kind: (typeof SIC_SOURCE_KINDS)[number];
  failureMode?: "blocking" | "isolated";
  homeUrl: string;
  endpoint: string;
  allowedRedirectOrigins?: string[];
  excludedTitlePatterns?: string[];
  admissionRule: string;
  rationale: string;
};

function assertSource(source: SicSource) {
  if (!SIC_SOURCE_GROUPS.includes(source.group)) throw new Error(`SiC 来源 ${source.id} 的内容组无效。`);
  if (!SIC_SOURCE_STATUSES.includes(source.status)) throw new Error(`SiC 来源 ${source.id} 的审批状态无效。`);
  if (!SIC_SOURCE_KINDS.includes(source.kind)) throw new Error(`SiC 来源 ${source.id} 的采集类型无效。`);
  if (source.status === "retired" && !source.statusReason?.trim()) throw new Error(`SiC 来源 ${source.id} 缺少退役原因。`);
  if (source.failureMode && !["blocking", "isolated"].includes(source.failureMode)) throw new Error(`SiC 来源 ${source.id} 的失败策略无效。`);
  for (const field of [source.id, source.name, source.publisher, source.homeUrl, source.endpoint, source.admissionRule, source.rationale]) {
    if (!field.trim()) throw new Error("SiC 来源缺少必填字段。");
  }
  if (!source.homeUrl.startsWith("https://") || !source.endpoint.startsWith("https://")) throw new Error(`SiC 来源 ${source.id} 只能使用 HTTPS。`);
  for (const origin of source.allowedRedirectOrigins ?? []) {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" || parsed.origin !== origin) throw new Error(`SiC 来源 ${source.id} 的跳转域名无效。`);
  }
  for (const pattern of source.excludedTitlePatterns ?? []) {
    if (!pattern.trim() || pattern.length > 240) throw new Error(`SiC 来源 ${source.id} 的标题排除规则无效。`);
    try {
      new RegExp(pattern, "iu");
    } catch {
      throw new Error(`SiC 来源 ${source.id} 的标题排除规则不是有效正则表达式。`);
    }
  }
  return source;
}

export function listSicSources() {
  if (registry.version !== 1 || !Array.isArray(registry.sources)) throw new Error("SiC 来源注册表格式无效。");
  return (registry.sources as SicSource[]).map(assertSource);
}

export function listApprovedSicSources() {
  return listSicSources().filter((source) => source.status === "approved");
}

export function listCollectableSicSources() {
  return listApprovedSicSources();
}
