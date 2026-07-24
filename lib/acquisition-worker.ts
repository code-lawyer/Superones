import "server-only";

import type { AcquisitionBatch } from "./acquisition-contract.ts";
import type {
  AcquisitionInboxStats,
  AcquisitionWorkItem,
} from "./acquisition-inbox.ts";

export type AcquisitionProcessingResult = {
  information?: number;
  publications?: number;
  profiles?: number;
  repositories?: number;
  rankings?: number;
};

export type AcquisitionBatchProcessor = (
  batch: AcquisitionBatch,
  work: Pick<AcquisitionWorkItem, "payloadHash" | "attempt">,
) => Promise<AcquisitionProcessingResult>;

export type AcquisitionWorkerInbox = {
  claimNext(excludedBatchIds?: ReadonlySet<string>): Promise<AcquisitionWorkItem | null>;
  complete(batchId: string): Promise<void>;
  fail(batchId: string, error: unknown): Promise<void>;
  stats(): Promise<AcquisitionInboxStats>;
};

export function createAcquisitionWorker(input: {
  inbox: AcquisitionWorkerInbox;
  processBatch: AcquisitionBatchProcessor;
}) {
  async function run(maxBatches = 8) {
    const limit = Math.max(1, Math.min(50, Math.floor(maxBatches)));
    const attemptedBatchIds = new Set<string>();
    const processed: Array<{
      batchId: string;
      runId: string;
      attempt: number;
      result: AcquisitionProcessingResult;
    }> = [];
    const failed: Array<{
      batchId: string;
      runId: string;
      attempt: number;
      error: string;
    }> = [];

    for (let index = 0; index < limit; index += 1) {
      const work = await input.inbox.claimNext(attemptedBatchIds);
      if (!work) break;
      attemptedBatchIds.add(work.batch.batchId);
      try {
        const result = await input.processBatch(work.batch, {
          payloadHash: work.payloadHash,
          attempt: work.attempt,
        });
        await input.inbox.complete(work.batch.batchId);
        processed.push({
          batchId: work.batch.batchId,
          runId: work.batch.runId,
          attempt: work.attempt,
          result,
        });
      } catch (error) {
        await input.inbox.fail(work.batch.batchId, error);
        failed.push({
          batchId: work.batch.batchId,
          runId: work.batch.runId,
          attempt: work.attempt,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        });
      }
    }

    return {
      processed,
      failed,
      queue: await input.inbox.stats(),
    };
  }

  return { run };
}
