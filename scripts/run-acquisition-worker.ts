import { configuredAcquisitionWorker } from "../lib/acquisition-runtime.ts";
import { pruneDurableRateLimits } from "../lib/rate-limit.ts";

const startedAt = new Date().toISOString();
const configuredMaxBatches = Number(process.env.VAULT2077_ACQUISITION_WORKER_MAX_BATCHES ?? "8");
const maxBatches = Math.max(
  1,
  Math.min(50, Number.isFinite(configuredMaxBatches) ? Math.floor(configuredMaxBatches) : 8),
);
const result = await configuredAcquisitionWorker().run(maxBatches);
const prunedRateLimits = await pruneDurableRateLimits();

console.log(JSON.stringify({
  status: result.failed.length === 0 ? "ok" : "degraded",
  startedAt,
  completedAt: new Date().toISOString(),
  maxBatches,
  prunedRateLimits,
  result,
}, null, 2));

if (result.failed.length > 0 || result.queue.quarantined > 0) {
  process.exitCode = 1;
}
