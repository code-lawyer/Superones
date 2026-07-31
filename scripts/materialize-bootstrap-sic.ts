import "server-only";

import {
  collectSicRawContent,
  type SicRawContentItem,
} from "../lib/sic-collector.ts";
import {
  getSicStoredContent,
  mergeSicStoredContent,
} from "../lib/sic-content-store.ts";

function clean(value: string | undefined, limit: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function bootstrapItem(raw: SicRawContentItem) {
  const material = clean(raw.sourceMaterial || raw.summary, 520);
  const summary = clean(raw.summary || raw.sourceMaterial, 520);
  const { sourceMaterial: _sourceMaterial, ...item } = raw;
  return {
    ...item,
    translatedTitle: clean(raw.title, 90),
    description: summary.slice(0, 140) || clean(raw.title, 140),
    contentSummary: material || summary || clean(raw.title, 520),
  };
}

const sourceIds = process.argv
  .slice(2)
  .filter((value) => !value.startsWith("--"));
const selectedSourceIds = sourceIds.length > 0
  ? sourceIds
  : ["microsoft-research-blog"];
const apply = process.argv.includes("--apply");
const packet = await collectSicRawContent(fetch, {
  sourceIds: selectedSourceIds,
  runMode: "bootstrap",
});
const items = packet.items.map(bootstrapItem);
const stored = await getSicStoredContent();
const selected = new Set(selectedSourceIds);
const reports = [
  ...stored.reports.filter((report) => !selected.has(report.sourceId)),
  ...packet.reports,
];

if (apply) {
  await mergeSicStoredContent({
    items,
    reports,
    updatedAt: packet.collectedAt,
  });
}

console.log(JSON.stringify({
  applied: apply,
  selectedSourceIds,
  reports: packet.reports,
  items: items.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    title: item.title,
    publishedAt: item.publishedAt,
  })),
}, null, 2));
