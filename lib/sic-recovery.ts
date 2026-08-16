import {
  acquisitionSourceIds,
} from "./acquisition-source-registry.ts";
import {
  payloadHash,
  validateAcquisitionBatch,
  type AcquisitionBatch,
} from "./acquisition-contract.ts";
import { sicContentIdentityKey } from "./sic-content-identity.ts";
import type { SicContentGroupId } from "./sic-content-types.ts";

export type SicRecoveryInboxRow = {
  batchId: string;
  payloadHash: string;
  rawPayload: string;
  status: string;
};

export type SicRecoveryBatch = {
  batch: AcquisitionBatch;
  payloadHash: string;
};

type SourceReportStatus = AcquisitionBatch["sourceReports"][number]["status"];

const EMPTY_GROUP_COUNTS: Record<SicContentGroupId, number> = {
  papers: 0,
  documents: 0,
  courses: 0,
  podcasts: 0,
};

function publicationGroup(batch: AcquisitionBatch, sourceId: string) {
  const record = batch.records.find((candidate) => (
    candidate.kind === "publication" && candidate.sourceId === sourceId
  ));
  const group = record?.payload.group;
  return typeof group === "string" && group in EMPTY_GROUP_COUNTS
    ? group as SicContentGroupId
    : null;
}

function recordIdentity(record: AcquisitionBatch["records"][number]) {
  const canonicalId = record.payload.canonicalId;
  return sicContentIdentityKey({
    sourceId: record.sourceId,
    canonicalId: typeof canonicalId === "string" ? canonicalId : undefined,
    url: record.canonicalUrl,
  });
}

function aggregateShardStatuses(statuses: SourceReportStatus[]): SourceReportStatus {
  if (statuses.every((status) => status === "succeeded")) return "succeeded";
  if (statuses.every((status) => status === "empty")) return "empty";
  if (statuses.every((status) => status === "empty" || status === "failed")) return "failed";
  return "partial";
}

function coalesceHistoricalRuns(batches: SicRecoveryBatch[]) {
  const runs = new Map<string, SicRecoveryBatch[]>();
  for (const entry of batches) {
    const current = runs.get(entry.batch.runId) ?? [];
    current.push(entry);
    runs.set(entry.batch.runId, current);
  }
  return [...runs.values()].map((entries): SicRecoveryBatch => {
    const first = entries[0]!;
    const last = entries.at(-1)!;
    for (const { batch } of entries) {
      if (batch.runMode !== first.batch.runMode || batch.schemaVersion !== first.batch.schemaVersion) {
        throw new Error(`SiC 恢复运行 ${first.batch.runId} 的分片合同不一致。`);
      }
      if (JSON.stringify(batch.sourceRegistry) !== JSON.stringify(first.batch.sourceRegistry)) {
        throw new Error(`SiC 恢复运行 ${first.batch.runId} 的来源快照不一致。`);
      }
    }
    const reports = new Map<string, AcquisitionBatch["sourceReports"]>();
    for (const { batch } of entries) {
      for (const report of batch.sourceReports) {
        const values = reports.get(report.sourceId) ?? [];
        values.push(report);
        reports.set(report.sourceId, values);
      }
    }
    const sourceReports = [...reports.entries()].map(([sourceId, values]) => {
      const base = values[0]!;
      if (values.some((report) => report.adapter !== base.adapter)) {
        throw new Error(`SiC 恢复运行 ${first.batch.runId} 的来源 ${sourceId} adapter 不一致。`);
      }
      const errors = [...new Set(values.flatMap((report) => report.errorMessage ? [report.errorMessage] : []))];
      return {
        ...base,
        status: aggregateShardStatuses(values.map((report) => report.status)),
        startedAt: values.map((report) => report.startedAt).sort()[0]!,
        completedAt: values.map((report) => report.completedAt).sort().at(-1)!,
        recordCount: values.reduce((total, report) => total + report.recordCount, 0),
        ...(errors.length > 0 ? { errorMessage: errors.join(" | ").slice(0, 1_000) } : {}),
      };
    }).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
    const batch: AcquisitionBatch = {
      ...first.batch,
      batchId: `recovery:${first.batch.batchId}`,
      windowFrom: entries.map(({ batch: value }) => value.windowFrom).sort()[0]!,
      windowUntil: entries.map(({ batch: value }) => value.windowUntil).sort().at(-1)!,
      collectedFrom: entries.map(({ batch: value }) => value.collectedFrom).sort()[0]!,
      collectedUntil: entries.map(({ batch: value }) => value.collectedUntil).sort().at(-1)!,
      collectedAt: last.batch.collectedAt,
      records: entries.flatMap(({ batch: value }) => value.records),
      sourceReports,
    };
    return { batch, payloadHash: payloadHash(JSON.stringify(batch)) };
  });
}

export function planSicPublicationRecovery(
  rows: SicRecoveryInboxRow[],
  options: { fromRunId?: string } = {},
) {
  const parsed = rows
    .filter((row) => row.status === "processed")
    .map((row): SicRecoveryBatch => {
      if (payloadHash(row.rawPayload) !== row.payloadHash) {
        throw new Error(`SiC 恢复批次 ${row.batchId} 的正文摘要不匹配。`);
      }
      const batch = validateAcquisitionBatch(JSON.parse(row.rawPayload) as unknown);
      if (batch.batchId !== row.batchId) throw new Error(`SiC 恢复批次 ${row.batchId} 的身份不匹配。`);
      return { batch, payloadHash: row.payloadHash };
    })
    .filter(({ batch }) => batch.lane === "sic")
    .sort((left, right) => (
      Date.parse(left.batch.collectedAt) - Date.parse(right.batch.collectedAt)
      || left.batch.batchId.localeCompare(right.batch.batchId)
    ));
  const latestBootstrapRunId = options.fromRunId ?? parsed.findLast(
    ({ batch }) => batch.runMode === "bootstrap",
  )?.batch.runId;
  const baselineIndex = latestBootstrapRunId
    ? parsed.findIndex(({ batch }) => batch.runId === latestBootstrapRunId && batch.runMode === "bootstrap")
    : -1;
  if (baselineIndex < 0) {
    throw new Error(options.fromRunId
      ? `没有找到已处理的 SiC bootstrap 运行 ${options.fromRunId}。`
      : "没有找到可用于恢复的已处理 SiC bootstrap 运行。");
  }
  const validatedInboxBatches = parsed.slice(baselineIndex);
  const batches = coalesceHistoricalRuns(validatedInboxBatches)
    .sort((left, right) => (
      Date.parse(left.batch.collectedAt) - Date.parse(right.batch.collectedAt)
      || left.batch.runId.localeCompare(right.batch.runId)
    ));
  const bySource = new Map<string, Map<string, SicContentGroupId>>();
  const snapshotBySource = new Map<string, string>();
  for (const { batch } of batches) {
    if (batch.sourceRegistry) {
      const active = new Set(acquisitionSourceIds(batch.sourceRegistry));
      for (const sourceId of bySource.keys()) {
        if (!active.has(sourceId)) {
          bySource.delete(sourceId);
          snapshotBySource.delete(sourceId);
        }
      }
    }
    const recordsBySource = new Map<string, AcquisitionBatch["records"]>();
    for (const record of batch.records) {
      if (record.kind !== "publication") continue;
      const sourceRecords = recordsBySource.get(record.sourceId) ?? [];
      sourceRecords.push(record);
      recordsBySource.set(record.sourceId, sourceRecords);
    }
    for (const report of batch.sourceReports) {
      if (report.status === "empty" || report.status === "failed") continue;
      const records = recordsBySource.get(report.sourceId) ?? [];
      const sameRunShard = snapshotBySource.get(report.sourceId) === batch.runId;
      const projected = report.status === "succeeded" && !sameRunShard
        ? new Map<string, SicContentGroupId>()
        : new Map(bySource.get(report.sourceId) ?? []);
      const fallbackGroup = publicationGroup(batch, report.sourceId);
      for (const record of records) {
        const rawGroup = record.payload.group;
        const group = typeof rawGroup === "string" && rawGroup in EMPTY_GROUP_COUNTS
          ? rawGroup as SicContentGroupId
          : fallbackGroup;
        if (group) projected.set(recordIdentity(record), group);
      }
      bySource.set(report.sourceId, projected);
      snapshotBySource.set(report.sourceId, batch.runId);
    }
  }
  const projectedRawCounts = { ...EMPTY_GROUP_COUNTS };
  for (const records of bySource.values()) {
    for (const group of records.values()) projectedRawCounts[group] += 1;
  }
  return {
    baselineRunId: batches[0].batch.runId,
    batches,
    validatedInboxBatchCount: validatedInboxBatches.length,
    projectedRawCounts,
    projectedSourceCount: [...bySource.values()].filter((records) => records.size > 0).length,
  };
}
