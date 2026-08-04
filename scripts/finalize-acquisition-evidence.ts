import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ACQUISITION_LANES,
  ACQUISITION_RUN_MODES,
  type AcquisitionLane,
  type AcquisitionRunMode,
} from "../lib/acquisition-contract.ts";
import {
  createAcquisitionRunEvidence,
  type AcquisitionRunManifest,
} from "../lib/acquisition-run-evidence.ts";

const outputRoot = path.resolve(process.env.VAULT2077_COLLECTOR_OUTPUT_DIR || ".collector-output");
const manifestPath = path.join(outputRoot, "run-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as AcquisitionRunManifest;
if (manifest.status === "completed" || manifest.status === "failed") {
  console.log(`evidence=${manifest.status} lane=${manifest.lane}; no finalization required`);
  process.exit(0);
}
if (manifest.schemaVersion !== 1
  || !ACQUISITION_LANES.includes(manifest.lane as AcquisitionLane)
  || !ACQUISITION_RUN_MODES.includes(manifest.runMode as AcquisitionRunMode)) {
  throw new Error("Started acquisition evidence has an invalid identity.");
}

await createAcquisitionRunEvidence({
  outputRoot,
  runId: manifest.runId,
  lane: manifest.lane,
  runMode: manifest.runMode,
  scheduleId: manifest.scheduleId,
  startedAt: manifest.startedAt,
}).fail(new Error("GitHub Actions workflow ended before collection completed."));
console.log(`evidence=failed lane=${manifest.lane}; interrupted run finalized`);
