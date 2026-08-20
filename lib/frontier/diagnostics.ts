import "server-only";

import { readFrontierStore } from "./internal-store.ts";
import type { FrontierStorageDiagnostics } from "./model.ts";

export async function getFrontierStorageDiagnostics(): Promise<FrontierStorageDiagnostics> {
  const store = await readFrontierStore();
  const documentBytes = Buffer.byteLength(JSON.stringify(store), "utf8");
  const peakMutationsPerHour = Math.max(0, ...store.mutationMetrics.map((item) => item.count));
  const reasons = [
    ...(documentBytes >= 4 * 1024 * 1024 ? ["document-size"] : []),
    ...(store.submissions.length >= 500 ? ["submission-cardinality"] : []),
    ...(peakMutationsPerHour >= 120 ? ["state-document-write-throughput"] : []),
  ];
  return {
    strategy: "single-state-document",
    documentBytes,
    submissionCount: store.submissions.length,
    prizeDonationCount: store.prizeDonations.length,
    snapshotCount: store.snapshots.length,
    seasonResultCount: store.seasonResults.length,
    peakMutationsPerHour,
    lockWaitEvidence: "postgresql-telemetry-required",
    normalizationRecommended: reasons.length > 0,
    reasons,
  };
}

export type { FrontierStorageDiagnostics } from "./model.ts";
