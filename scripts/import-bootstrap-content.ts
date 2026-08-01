import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStoredContent, replaceStoredContent } from "../lib/content-store.ts";
import {
  persistDirectRankingBoards,
  type DirectRankingBoard,
} from "../lib/direct-rankings.ts";
import { mergeSicStoredContent } from "../lib/sic-content-store.ts";
import type {
  SicContentItem,
  SicSourceCollectionReport,
} from "../lib/sic-content-types.ts";
import type {
  EventRecord,
  InformationItem,
  TrendProject,
} from "../lib/types.ts";
import { mergeBootstrapContentSeed } from "./bootstrap-manifest.ts";

type Manifest = {
  version: 1;
  files: Record<string, { sha256: string; bytes: number }>;
};

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

const confirmed = process.argv.includes("--confirm");
if (!confirmed) {
  throw new Error("Bootstrap import adds verified missing seed content. Re-run with --confirm.");
}
const directory = path.resolve("data", "bootstrap");
const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")) as Manifest;
if (manifest.version !== 1) throw new Error("Unsupported bootstrap manifest version.");

async function verifiedJson<T>(name: string): Promise<T> {
  const payload = await readFile(path.join(directory, name), "utf8");
  const expected = manifest.files[name];
  if (!expected || expected.sha256 !== hash(payload) || expected.bytes !== Buffer.byteLength(payload)) {
    throw new Error(`Bootstrap seed verification failed for ${name}.`);
  }
  return JSON.parse(payload) as T;
}

const content = await verifiedJson<{
  updatedAt: string | null;
  sourceCount: number;
  events: EventRecord[];
  information: InformationItem[];
  projects: TrendProject[];
}>("content-store.seed.json");
const sic = await verifiedJson<{
  updatedAt: string | null;
  items: SicContentItem[];
  reports: SicSourceCollectionReport[];
}>("sic-content-store.seed.json");
const rankings = await verifiedJson<{ boards: DirectRankingBoard[] }>("direct-rankings.seed.json");

const current = await getStoredContent();
const mergedContent = mergeBootstrapContentSeed({
  updatedAt: current.state.updatedAt,
  sourceCount: current.state.sourceCount,
  events: current.events,
  information: current.information,
  projects: current.projects,
}, content);

await replaceStoredContent({
  events: mergedContent.events,
  information: mergedContent.information,
  projects: mergedContent.projects,
  quarantine: [],
  sourceCount: mergedContent.sourceCount,
  updatedAt: mergedContent.updatedAt ?? undefined,
});
await mergeSicStoredContent({
  items: sic.items,
  reports: sic.reports,
  updatedAt: sic.updatedAt ?? undefined,
});
await persistDirectRankingBoards(rankings.boards);
console.log(JSON.stringify({
  ok: true,
  mode: "merge-missing",
  information: content.information.length,
  events: content.events.length,
  sic: sic.items.length,
  rankingBoards: rankings.boards.length,
}, null, 2));
