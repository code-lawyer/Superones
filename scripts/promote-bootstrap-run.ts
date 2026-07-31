import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { buildBootstrapManifest } from "./bootstrap-manifest.ts";

function object(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not a JSON object.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array.`);
  return value;
}

const runDirectory = process.argv[2];
if (!runDirectory) {
  throw new Error("Usage: promote-bootstrap-run.ts <local-run-directory>");
}
const runData = path.resolve(runDirectory, "data");
const outputDirectory = path.resolve("data", "bootstrap");
const content = object(JSON.parse(await readFile(path.join(runData, "content-store.json"), "utf8")), "content store");
const sic = object(JSON.parse(await readFile(path.join(runData, "sic-content-store.json"), "utf8")), "SiC store");
const rankings = object(JSON.parse(await readFile(path.join(runData, "direct-rankings.json"), "utf8")), "ranking store");
const information = array(content.information, "content information");
const events = array(content.events, "content events");
const sicItems = array(sic.items, "SiC items");
const boards = array(rankings.boards, "ranking boards");
const informationBySlug = new Map(information.flatMap((value) => {
  const item = object(value, "information item");
  return typeof item.slug === "string" ? [[item.slug, item] as const] : [];
}));
const roadsideCount = information.filter((value) => (
  object(value, "information item").contentGroup === "roadside"
)).length;
if (information.length === 0) throw new Error("Bootstrap promotion requires information content.");
if (roadsideCount === 0) throw new Error("Bootstrap promotion requires roadside content.");
if (sicItems.length === 0) throw new Error("Bootstrap promotion requires SiC content.");
if (boards.length !== 5 || boards.some((value) => array(object(value, "ranking board").items, "ranking items").length === 0)) {
  throw new Error("Bootstrap promotion requires all five non-empty ranking boards.");
}
for (const value of events) {
  const event = object(value, "event");
  for (const rawSource of array(event.sources, "event sources")) {
    const source = object(rawSource, "event source");
    const item = typeof source.informationSlug === "string"
      ? informationBySlug.get(source.informationSlug)
      : undefined;
    if (!item || item.contentGroup !== "information") {
      throw new Error("Every bootstrap event source must reference the information waterfall.");
    }
  }
}

const promotedContent = {
  ...content,
  quarantine: [],
  batches: [],
};
const files = {
  "content-store.seed.json": `${JSON.stringify(promotedContent, null, 2)}\n`,
  "sic-content-store.seed.json": `${JSON.stringify(sic, null, 2)}\n`,
  "direct-rankings.seed.json": `${JSON.stringify(rankings, null, 2)}\n`,
};
const sourceRunDirectory = path.relative(
  process.cwd(),
  path.resolve(runDirectory),
).replaceAll("\\", "/");
if (!sourceRunDirectory || sourceRunDirectory.startsWith("../")) {
  throw new Error("Bootstrap source run must stay inside the workspace.");
}
const manifest = buildBootstrapManifest(files, sourceRunDirectory);

await mkdir(outputDirectory, { recursive: true });
for (const [name, value] of Object.entries(files)) {
  await writeFile(path.join(outputDirectory, name), value, "utf8");
}
await writeFile(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(manifest, null, 2));
