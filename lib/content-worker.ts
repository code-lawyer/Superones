import "server-only";

import { payloadHash } from "./content-contract.ts";
import { processInboundContent } from "./content-pipeline.ts";
import { claimNextInboundBatch, completeInboundBatch, failInboundBatch, inboundBatchStats } from "./inbound-batch-store.ts";

export async function processPendingInboundBatches(maxBatches = 4) {
  const limit = Math.max(1, Math.min(20, Math.floor(maxBatches)));
  const processed: Array<{ batchId: string; duplicate: boolean; information: number; events: number; projects: number }> = [];
  for (let index = 0; index < limit; index += 1) {
    const batch = await claimNextInboundBatch();
    if (!batch) break;
    try {
      const parsed = JSON.parse(batch.rawPayload) as unknown;
      const result = await processInboundContent(parsed, payloadHash(batch.rawPayload));
      await completeInboundBatch(batch.batchId);
      processed.push({
        batchId: batch.batchId,
        duplicate: result.duplicate,
        information: result.information.length,
        events: result.events.length,
        projects: result.projects.length,
      });
    } catch (error) {
      await failInboundBatch(batch.batchId, error);
      throw error;
    }
  }
  return { processed, queue: await inboundBatchStats() };
}
