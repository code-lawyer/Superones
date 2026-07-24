import "server-only";

import { readFileSync } from "node:fs";

const registry = JSON.parse(readFileSync(new URL("../config/sic-source-registry.json", import.meta.url), "utf8")) as { version: number; sources: unknown[] };

export const SIC_SOURCE_GROUPS = ["papers", "archive", "courses", "podcasts"] as const;
export const SIC_SOURCE_STATUSES = ["pending_review", "approved", "paused", "rejected"] as const;

export type SicSourceGroup = (typeof SIC_SOURCE_GROUPS)[number];
export type SicSourceStatus = (typeof SIC_SOURCE_STATUSES)[number];

export type SicSource = {
  id: string;
  group: SicSourceGroup;
  status: SicSourceStatus;
  name: string;
  publisher: string;
  kind:
    | "official_rss"
    | "official_atom"
    | "official_sitemap"
    | "official_dated_index"
    | "official_index"
    | "official_catalog"
    | "official_channel"
    | "official_api"
    | "official_repository"
    | "hosted_podcast";
  homeUrl: string;
  endpoint: string;
  allowedRedirectOrigins?: string[];
  admissionRule: string;
  rationale: string;
};

function assertSource(source: SicSource) {
  if (!SIC_SOURCE_GROUPS.includes(source.group)) throw new Error(`SiC 来源 ${source.id} 的内容组无效。`);
  if (!SIC_SOURCE_STATUSES.includes(source.status)) throw new Error(`SiC 来源 ${source.id} 的审批状态无效。`);
  for (const field of [source.id, source.name, source.publisher, source.homeUrl, source.endpoint, source.admissionRule, source.rationale]) {
    if (!field.trim()) throw new Error("SiC 来源缺少必填字段。");
  }
  if (!source.homeUrl.startsWith("https://") || !source.endpoint.startsWith("https://")) throw new Error(`SiC 来源 ${source.id} 只能使用 HTTPS。`);
  for (const origin of source.allowedRedirectOrigins ?? []) {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" || parsed.origin !== origin) throw new Error(`SiC 来源 ${source.id} 的跳转域名无效。`);
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
