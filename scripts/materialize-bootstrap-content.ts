import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { validateAcquisitionBatch } from "../lib/acquisition-contract.ts";
import { informationFromAcquisitionRecord } from "../lib/acquisition-processor.ts";
import { createBootstrapEditorialPort } from "../lib/bootstrap-editorial.ts";
import { compileInformationBatch } from "../lib/content-compiler.ts";
import { validateContentBatch } from "../lib/content-contract.ts";
import { getStoredContent, replaceStoredContent } from "../lib/content-store.ts";

const runDirectory = path.resolve(process.argv[2] ?? "");
const apply = process.argv.includes("--apply");
if (!process.argv[2]) {
  throw new Error("Usage: materialize-bootstrap-content <run-directory> [--apply]");
}

const inboxDirectory = path.join(runDirectory, "data", "acquisition-inbox");
const files = (await readdir(inboxDirectory))
  .filter((file) => file.endsWith(".json"))
  .sort();
const batches = [];
for (const file of files) {
  const record = JSON.parse(await readFile(path.join(inboxDirectory, file), "utf8")) as {
    rawPayload?: unknown;
  };
  if (typeof record.rawPayload !== "string") continue;
  const batch = validateAcquisitionBatch(JSON.parse(record.rawPayload) as unknown);
  if (!["information", "roadside", "statements"].includes(batch.lane)) continue;
  batches.push(batch);
}
batches.sort((left, right) => (
  Date.parse(left.collectedAt) - Date.parse(right.collectedAt)
  || left.batchId.localeCompare(right.batchId)
));

const previous = await getStoredContent();
let information = [...previous.information];
let events = [...previous.events];
const quarantine = [];
const editorial = createBootstrapEditorialPort();
for (const batch of batches) {
  const informationRecords = batch.records.filter((record) => record.kind === "information");
  if (informationRecords.length === 0) continue;
  const legacy = validateContentBatch({
    version: 2,
    batchId: batch.batchId,
    sourceBundleRevision: batch.registryRevision,
    collectedFrom: batch.collectedFrom,
    collectedUntil: batch.collectedUntil,
    generatedAt: batch.collectedAt,
    information: informationRecords.map(informationFromAcquisitionRecord),
    repositories: [],
  });
  const compiled = await compileInformationBatch({
    batch: legacy,
    previousInformation: information,
    previousEvents: events,
    editorial,
  });
  information = compiled.information;
  events = compiled.events;
  quarantine.push(...compiled.quarantine);
}

const informationCount = information.filter((item) => item.contentGroup !== "roadside").length;
const roadsideCount = information.filter((item) => item.contentGroup === "roadside").length;
const sourceCount = new Set(
  information
    .map((item) => item.sourceChannelId)
    .filter((value): value is string => Boolean(value)),
).size;
const summary = {
  batches: batches.length,
  before: previous.information.length,
  after: information.length,
  added: information.length - previous.information.length,
  information: informationCount,
  roadside: roadsideCount,
  events: events.length,
  quarantined: quarantine.length,
  sourceCount,
  apply,
};

if (apply) {
  await replaceStoredContent({
    events,
    information,
    projects: previous.projects,
    quarantine,
    sourceCount,
    updatedAt: batches.at(-1)?.collectedAt ?? new Date().toISOString(),
  });
}

console.log(JSON.stringify(summary, null, 2));
