export type AcquisitionFailureMode = "blocking" | "isolated";

export type AcquisitionSourceStatus = {
  sourceId: string;
  status: "succeeded" | "partial" | "empty" | "failed";
};

export type AcquisitionFailureEvaluation = {
  shouldFailWorkflow: boolean;
  blockingSourceIds: string[];
  isolatedSourceIds: string[];
};

/**
 * Keep workflow health independent from explicitly optional source adapters.
 * Unknown sources remain blocking so a registry/report mismatch fails closed.
 */
export function evaluateAcquisitionFailures(
  reports: AcquisitionSourceStatus[],
  failureModeBySource: ReadonlyMap<string, AcquisitionFailureMode>,
): AcquisitionFailureEvaluation {
  const blockingSourceIds: string[] = [];
  const isolatedSourceIds: string[] = [];
  for (const report of reports) {
    if (report.status !== "failed") continue;
    if (failureModeBySource.get(report.sourceId) === "isolated") {
      isolatedSourceIds.push(report.sourceId);
    } else {
      blockingSourceIds.push(report.sourceId);
    }
  }
  blockingSourceIds.sort();
  isolatedSourceIds.sort();
  return {
    shouldFailWorkflow: blockingSourceIds.length > 0,
    blockingSourceIds,
    isolatedSourceIds,
  };
}
