import { readFile } from "node:fs/promises";
import path from "node:path";
import { meetsEventThreshold } from "../lib/content-compiler.ts";
import type { InformationItem } from "../lib/types.ts";

type DiagnosticContentStore = {
  events: unknown[];
  information: InformationItem[];
};

const input = process.argv[2];
if (!input) throw new Error("Usage: diagnose-event-candidates.ts <content-store.json>");

const store = JSON.parse(
  await readFile(path.resolve(input), "utf8"),
) as DiagnosticContentStore;
const candidates = new Map<string, InformationItem[]>();
for (const item of store.information) {
  if (!item.eventCandidateKey || item.eventSlugs.length > 0) continue;
  const group = candidates.get(item.eventCandidateKey) ?? [];
  group.push(item);
  candidates.set(item.eventCandidateKey, group);
}

const groups = [...candidates.entries()]
  .map(([candidateKey, items]) => ({
    candidateKey,
    items: items.length,
    publishers: new Set(items.map((item) => (
      item.ownerEntity || item.originalPublisher || item.sourceName
    ).toLowerCase())).size,
    roles: new Set(items.map((item) => item.sourceRole)).size,
    qualifies: meetsEventThreshold(items),
    titles: items.map((item) => item.translatedTitle),
  }))
  .sort((left, right) => right.items - left.items);
const contentGroups = Object.fromEntries(
  [...new Set(store.information.map((item) => item.contentGroup ?? "missing"))]
    .map((group) => [
      group,
      store.information.filter((item) => (item.contentGroup ?? "missing") === group).length,
    ]),
);
const report = {
  information: store.information.length,
  events: store.events.length,
  candidateItems: groups.reduce((sum, group) => sum + group.items, 0),
  candidateGroups: groups.length,
  qualifyingGroups: groups.filter((group) => group.qualifies).length,
  contentGroups,
  groups,
};

console.log(JSON.stringify(report, null, 2));
if (store.information.length > 0 && store.events.length === 0) {
  process.exitCode = 2;
}
