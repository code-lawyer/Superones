import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  ACQUISITION_LANES,
  ACQUISITION_RUN_MODES,
  type AcquisitionLane,
  type AcquisitionRunMode,
} from "../lib/acquisition-contract.ts";
import { createAcquisitionRunEvidence } from "../lib/acquisition-run-evidence.ts";

const outputRoot = path.resolve(process.env.VAULT2077_COLLECTOR_OUTPUT_DIR || ".collector-output");
const lane = process.env.VAULT2077_ACQUISITION_LANE;
const runMode = process.env.VAULT2077_ACQUISITION_RUN_MODE;
if (!ACQUISITION_LANES.includes(lane as AcquisitionLane)) {
  throw new Error(`Unknown acquisition lane: ${lane ?? "missing"}.`);
}
if (!ACQUISITION_RUN_MODES.includes(runMode as AcquisitionRunMode)) {
  throw new Error(`Unknown acquisition run mode: ${runMode ?? "missing"}.`);
}

const startedAt = new Date().toISOString();
const runId = `run:${process.env.GITHUB_RUN_ID || startedAt.replace(/\D/g, "").slice(0, 14)}:${lane}`;
const scheduleId = process.env.VAULT2077_SCHEDULE_ID || `${runMode}:${lane}:${runId}`;
await mkdir(outputRoot, { recursive: true });
await createAcquisitionRunEvidence({
  outputRoot,
  runId,
  lane: lane as AcquisitionLane,
  runMode: runMode as AcquisitionRunMode,
  scheduleId,
  startedAt,
}).begin();
console.log(`evidence=started lane=${lane} run=${runId}`);
