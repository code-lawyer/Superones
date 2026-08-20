import type { SicSource } from "./sic-source-registry.ts";

export type SicSourceAdapterId =
  | "hugging-face-weekly"
  | "trusted-json-feed"
  | "xml-feed"
  | "github-commit-feed"
  | "sitemap"
  | "dated-index"
  | "generic-html";

type SicSourceAdapter = {
  id: SicSourceAdapterId;
  accepts(source: SicSource): boolean;
};

const adapters: readonly SicSourceAdapter[] = [
  {
    id: "hugging-face-weekly",
    accepts: (source) => source.kind === "official_api" && source.id === "hugging-face-daily-papers",
  },
  { id: "trusted-json-feed", accepts: (source) => source.kind === "trusted_feed_json" },
  { id: "xml-feed", accepts: (source) => ["official_rss", "official_atom", "official_channel", "hosted_podcast"].includes(source.kind) },
  { id: "github-commit-feed", accepts: (source) => source.kind === "official_api" && source.id === "dair-ai-papers-of-the-week" },
  { id: "sitemap", accepts: (source) => source.kind === "official_sitemap" },
  { id: "dated-index", accepts: (source) => source.kind === "official_dated_index" },
  {
    id: "generic-html",
    accepts: (source) => ["official_index", "official_catalog", "official_repository", "official_api"].includes(source.kind),
  },
];

export function resolveSicSourceAdapter(source: SicSource): SicSourceAdapterId {
  const adapter = adapters.find((candidate) => candidate.accepts(source));
  if (!adapter) throw new Error(`SiC 来源 ${source.id} 没有已部署的采集适配器。`);
  return adapter.id;
}
