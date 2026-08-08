import "server-only";

import type { AcquisitionBatch } from "./acquisition-contract.ts";
import type { AcquisitionLane } from "./acquisition-contract.ts";
import type {
  AcquisitionFailureDisposition,
  AcquisitionInboxStatus,
  AcquisitionInboxStats,
  AcquisitionWorkItem,
} from "./acquisition-inbox.ts";
import { withPersistenceTransaction } from "./state-document-store.ts";

export class AcquisitionQuarantineError extends Error {
  readonly code: string;

  constructor(message: string, code = "INVALID_ACQUISITION_RECORD") {
    super(message);
    this.name = "AcquisitionQuarantineError";
    this.code = code;
  }
}

export type AcquisitionProcessingResult = {
  information?: number;
  publications?: number;
  profiles?: number;
  repositories?: number;
  rankings?: number;
};

export type AcquisitionBatchProcessor = (
  batch: AcquisitionBatch,
  work: Pick<AcquisitionWorkItem, "payloadHash" | "attempt"> & { deadlineAt?: number },
) => Promise<AcquisitionProcessingResult>;

export type AcquisitionWorkerInbox = {
  claimNext(excludedBatchIds?: ReadonlySet<string>): Promise<AcquisitionWorkItem | null>;
  complete(batchId: string, claimToken: string): Promise<void>;
  fail(
    batchId: string,
    claimToken: string,
    error: unknown,
    disposition?: AcquisitionFailureDisposition,
  ): Promise<AcquisitionInboxStatus>;
  stats(): Promise<AcquisitionInboxStats>;
  prune?(): Promise<number>;
};

export function createAcquisitionWorker(input: {
  inbox: AcquisitionWorkerInbox;
  processBatch: AcquisitionBatchProcessor;
  runAtomically?: typeof withPersistenceTransaction;
  runBudgetMs?: number;
  clock?: () => number;
}) {
  const runAtomically = input.runAtomically ?? withPersistenceTransaction;
  const clock = input.clock ?? Date.now;
  const configuredRunBudgetMs = input.runBudgetMs ?? 45 * 60 * 1000;
  const runBudgetMs = Math.max(1, Math.min(50 * 60 * 1000, Math.floor(configuredRunBudgetMs)));
  async function run(maxBatches = 8) {
    const limit = Math.max(1, Math.min(50, Math.floor(maxBatches)));
    const deadlineAt = clock() + runBudgetMs;
    const attemptedBatchIds = new Set<string>();
    const processed: Array<{
      batchId: string;
      runId: string;
      lane: AcquisitionLane;
      scheduleId: string;
      attempt: number;
      durationMs: number;
      result: AcquisitionProcessingResult;
    }> = [];
    const failed: Array<{
      batchId: string;
      runId: string;
      lane: AcquisitionLane;
      scheduleId: string;
      attempt: number;
      durationMs: number;
      error: string;
      status: "retryable" | "quarantined";
    }> = [];
    const warnings: Array<{
      batchId: string;
      lane: AcquisitionLane;
      code: "LANE_PROCESSING_SLOW";
      durationMs: number;
    }> = [];

    for (let index = 0; index < limit; index += 1) {
      if (clock() >= deadlineAt) break;
      const work = await input.inbox.claimNext(attemptedBatchIds);
      if (!work) break;
      attemptedBatchIds.add(work.batch.batchId);
      const startedAt = clock();
      try {
        const result = await runAtomically(async () => {
          const processed = await input.processBatch(work.batch, {
            payloadHash: work.payloadHash,
            attempt: work.attempt,
            deadlineAt,
          });
          await input.inbox.complete(work.batch.batchId, work.claimToken);
          return processed;
        });
        const durationMs = clock() - startedAt;
        processed.push({
          batchId: work.batch.batchId,
          runId: work.batch.runId,
          lane: work.batch.lane,
          scheduleId: work.batch.scheduleId,
          attempt: work.attempt,
          durationMs,
          result,
        });
        if (durationMs > 30 * 60 * 1000) {
          warnings.push({
            batchId: work.batch.batchId,
            lane: work.batch.lane,
            code: "LANE_PROCESSING_SLOW",
            durationMs,
          });
        }
      } catch (error) {
        const durationMs = clock() - startedAt;
        const disposition = error instanceof AcquisitionQuarantineError
          ? "quarantined"
          : "retryable";
        const status = await input.inbox.fail(work.batch.batchId, work.claimToken, error, disposition);
        failed.push({
          batchId: work.batch.batchId,
          runId: work.batch.runId,
          lane: work.batch.lane,
          scheduleId: work.batch.scheduleId,
          attempt: work.attempt,
          durationMs,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
          status: status === "quarantined" ? "quarantined" : "retryable",
        });
      }
    }

    const pruned = await input.inbox.prune?.() ?? 0;
    return {
      processed,
      failed,
      warnings,
      pruned,
      queue: await input.inbox.stats(),
    };
  }

  return { run };
}
