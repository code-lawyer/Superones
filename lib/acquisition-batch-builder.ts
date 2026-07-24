import { createHash } from "node:crypto";
import {
  MAX_ACQUISITION_BATCH_BYTES,
  MAX_ACQUISITION_RECORDS,
  MAX_ACQUISITION_SOURCE_REPORTS,
  validateAcquisitionBatch,
  type AcquisitionBatch,
  type AcquisitionRecord,
  type AcquisitionSourceReport,
  type AcquisitionSourceStatus,
  type JsonValue,
} from "./acquisition-contract.ts";
import { MAX_BATCH_ITEMS, type InboundContentBatch } from "./content-contract.ts";
import type { SicRawCollection } from "./sic-collector.ts";

const TARGET_BATCH_BYTES = MAX_ACQUISITION_BATCH_BYTES - 256 * 1024;

export type AcquisitionBuildContext = {
  runId: string;
  registryRevision: string;
  collectedFrom: string;
  collectedUntil: string;
  collectedAt: string;
};

export type AcquisitionSourceGroup = {
  report: AcquisitionSourceReport;
  records: AcquisitionRecord[];
};

type VaultCollectionOutcome = {
  source_id?: string;
  sourceId?: string;
  status: string;
  error?: string | null;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableId(value: string, fallback: string, limit = 180) {
  const normalized = value.trim().replace(/[^A-Za-z0-9_.:/-]+/g, "-").slice(0, limit);
  return /^[A-Za-z0-9]/.test(normalized) ? normalized : fallback;
}

function jsonObject(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined),
  );
}

function sourceStatus(status: string, recordCount: number): AcquisitionSourceStatus {
  if (recordCount > 0) {
    if (status === "partial") return "partial";
    return "succeeded";
  }
  if (status === "failure" || status === "failed") return "failed";
  if (status === "partial") return "partial";
  return "empty";
}

function report(input: {
  sourceId: string;
  adapter: string;
  status: string;
  recordCount: number;
  context: AcquisitionBuildContext;
  error?: string | null;
}): AcquisitionSourceReport {
  return {
    sourceId: stableId(input.sourceId, `source:${sha256(input.sourceId).slice(0, 20)}`),
    adapter: stableId(input.adapter, "unknown-adapter"),
    status: sourceStatus(input.status, input.recordCount),
    startedAt: input.context.collectedFrom,
    completedAt: input.context.collectedUntil,
    recordCount: input.recordCount,
    ...(input.error ? {
      errorCode: "SOURCE_COLLECTION_FAILED",
      errorMessage: input.error.slice(0, 1_000),
    } : {}),
  };
}

function batchBytes(batch: AcquisitionBatch) {
  return Buffer.byteLength(JSON.stringify(batch), "utf8");
}

export function packAcquisitionGroups(
  context: AcquisitionBuildContext,
  groups: AcquisitionSourceGroup[],
  batchPrefix: string,
  options: { maxRecords?: number } = {},
) {
  const maxRecords = Math.min(
    MAX_ACQUISITION_RECORDS,
    Math.max(1, Math.floor(options.maxRecords ?? MAX_ACQUISITION_RECORDS)),
  );
  const batches: AcquisitionBatch[] = [];
  let pending: AcquisitionSourceGroup[] = [];

  function candidate(values: AcquisitionSourceGroup[], index: number): AcquisitionBatch {
    return {
      schemaVersion: 1,
      batchId: `${stableId(batchPrefix, "acquisition", 110)}:${String(index + 1).padStart(4, "0")}`,
      runId: stableId(context.runId, `run:${sha256(context.runId).slice(0, 20)}`),
      registryRevision: stableId(context.registryRevision, "registry:unknown"),
      collectedFrom: context.collectedFrom,
      collectedUntil: context.collectedUntil,
      collectedAt: context.collectedAt,
      records: values.flatMap((group) => group.records),
      sourceReports: values.map((group) => ({
        ...group.report,
        recordCount: group.records.length,
      })),
    };
  }

  function flush() {
    if (pending.length === 0) return;
    batches.push(validateAcquisitionBatch(candidate(pending, batches.length)));
    pending = [];
  }

  const partitioned = groups.flatMap((group) => {
    if (group.records.length <= maxRecords) return [group];
    const parts: AcquisitionSourceGroup[] = [];
    for (let start = 0; start < group.records.length; start += maxRecords) {
      parts.push({ report: group.report, records: group.records.slice(start, start + maxRecords) });
    }
    return parts;
  });

  for (const group of partitioned) {
    if (pending.some((value) => value.report.sourceId === group.report.sourceId)) flush();
    const next = [...pending, group];
    const value = candidate(next, batches.length);
    if (
      pending.length > 0
      && (
        value.records.length > maxRecords
        || value.sourceReports.length > MAX_ACQUISITION_SOURCE_REPORTS
        || batchBytes(value) > TARGET_BATCH_BYTES
      )
    ) {
      flush();
    }
    const single = candidate([...pending, group], batches.length);
    if (batchBytes(single) > TARGET_BATCH_BYTES) {
      throw new Error(`来源 ${group.report.sourceId} 的单源批次超过安全字节限制。`);
    }
    pending.push(group);
  }
  flush();
  return batches;
}

export function buildVaultAcquisitionBatches(input: {
  context: AcquisitionBuildContext;
  packets: InboundContentBatch[];
  outcomes: VaultCollectionOutcome[];
  connectorBySource: Map<string, string>;
}) {
  const recordsBySource = new Map<string, AcquisitionRecord[]>();
  const informationById = new Map<string, AcquisitionRecord>();
  for (const packet of input.packets) {
    for (const item of packet.information) {
      const recordId = `information:${sha256(item.idempotencyKey)}`;
      const existing = informationById.get(recordId);
      if (existing) {
        if (existing.contentHash !== item.contentHash) {
          throw new Error(`资讯 ${item.idempotencyKey} 在同一轮采集中出现不同正文。`);
        }
        continue;
      }
      const values = recordsBySource.get(item.sourceChannelId) ?? [];
      const record: AcquisitionRecord = {
        schemaVersion: 1,
        kind: "information",
        recordId,
        sourceId: item.sourceChannelId,
        externalId: item.idempotencyKey,
        canonicalUrl: item.originalUrl,
        observedAt: item.fetchedAt,
        contentHash: item.contentHash,
        payload: jsonObject({
          discoveryPath: item.discoveryPath,
          originalPublisher: item.originalPublisher,
          ownerEntity: item.ownerEntity,
          publisherKind: item.publisherKind,
          evidenceNature: item.evidenceNature,
          classificationConfidence: item.classificationConfidence,
          originalAuthor: item.originalAuthor,
          sourceRole: item.sourceRole,
          originalPublishedAt: item.originalPublishedAt,
          originalLanguage: item.originalLanguage,
          originalTitle: item.originalTitle,
          originalContent: item.originalContent,
          contentCompleteness: item.contentCompleteness,
          sourceStream: item.sourceStream,
          originPlatform: item.originPlatform,
          originAccount: item.originAccount,
          originContentId: item.originContentId,
          originUrl: item.originUrl,
          originResolution: item.originResolution,
          transportKind: item.transportKind,
          transportProvider: item.transportProvider,
        }),
      };
      values.push(record);
      informationById.set(recordId, record);
      recordsBySource.set(item.sourceChannelId, values);
    }
  }

  const outcomeBySource = new Map(input.outcomes.map((outcome) => [
    outcome.sourceId ?? outcome.source_id ?? "",
    outcome,
  ]));
  const allSourceIds = new Set([
    ...input.connectorBySource.keys(),
    ...outcomeBySource.keys(),
    ...recordsBySource.keys(),
  ]);
  allSourceIds.delete("");
  const groups: AcquisitionSourceGroup[] = [...allSourceIds].sort().map((sourceId) => {
    const records = recordsBySource.get(sourceId) ?? [];
    const outcome = outcomeBySource.get(sourceId);
    return {
      records,
      report: report({
        sourceId,
        adapter: input.connectorBySource.get(sourceId) ?? "vault-collector",
        status: outcome?.status ?? (records.length ? "success" : "failure"),
        recordCount: records.length,
        context: input.context,
        error: outcome?.error,
      }),
    };
  });

  const repositories = [...new Map(input.packets
    .flatMap((packet) => packet.repositories)
    .map((item) => [item.githubId, item])).values()];
  if (repositories.length > 0) {
    const records = repositories.map((item): AcquisitionRecord => ({
      schemaVersion: 1,
      kind: "repository_observation",
      recordId: `repository:github:${item.githubId}`,
      sourceId: "vault:github-projects",
      externalId: `${item.owner}/${item.name}`,
      canonicalUrl: item.canonicalUrl,
      observedAt: item.fetchedAt,
      contentHash: sha256(JSON.stringify(item)),
      payload: jsonObject({
        target: "vault_project",
        githubId: item.githubId,
        owner: item.owner,
        name: item.name,
        description: item.description,
        readme: item.readme,
        readmeSha: item.readmeSha,
        license: item.license,
        primaryLanguage: item.primaryLanguage,
        stars: item.stars,
        forks: item.forks,
        watchers: item.watchers,
        createdAt: item.createdAt,
        pushedAt: item.pushedAt,
        delta24: item.delta24,
        delta7: item.delta7,
      }),
    }));
    groups.push({
      records,
      report: report({
        sourceId: "vault:github-projects",
        adapter: "github-rest",
        status: "success",
        recordCount: records.length,
        context: input.context,
      }),
    });
  }
  return packAcquisitionGroups(
    input.context,
    groups,
    `acquisition:${input.context.runId}:vault`,
    { maxRecords: MAX_BATCH_ITEMS },
  );
}

export function buildSicAcquisitionBatches(input: {
  context: AcquisitionBuildContext;
  collection: SicRawCollection;
  adapterBySource: Map<string, string>;
}) {
  const itemsBySource = new Map<string, SicRawCollection["items"]>();
  for (const item of input.collection.items) {
    const values = itemsBySource.get(item.sourceId) ?? [];
    values.push(item);
    itemsBySource.set(item.sourceId, values);
  }
  const reportBySource = new Map(input.collection.reports.map((item) => [item.sourceId, item]));
  const sourceIds = new Set([...reportBySource.keys(), ...itemsBySource.keys()]);
  const groups: AcquisitionSourceGroup[] = [...sourceIds].sort().map((sourceId) => {
    const items = itemsBySource.get(sourceId) ?? [];
    const records = items.map((item): AcquisitionRecord => ({
      schemaVersion: 1,
      kind: "publication",
      recordId: `publication:${sha256(`${item.sourceId}:${item.url}`)}`,
      sourceId: item.sourceId,
      externalId: item.id,
      canonicalUrl: item.url,
      observedAt: item.collectedAt,
      contentHash: sha256(JSON.stringify(item)),
      payload: jsonObject({
        group: item.group,
        sourceName: item.sourceName,
        publisher: item.publisher,
        title: item.title,
        summary: item.summary,
        sourceMaterial: item.sourceMaterial,
        publishedAt: item.publishedAt,
      }),
    }));
    const sourceReport = reportBySource.get(sourceId);
    return {
      records,
      report: report({
        sourceId,
        adapter: input.adapterBySource.get(sourceId) ?? "sic-source",
        status: sourceReport?.status ?? (records.length ? "success" : "failure"),
        recordCount: records.length,
        context: input.context,
        error: sourceReport?.error,
      }),
    };
  });
  return packAcquisitionGroups(input.context, groups, `acquisition:${input.context.runId}:sic`);
}

export function buildRankingAcquisitionBatches(input: {
  context: AcquisitionBuildContext;
  groups: AcquisitionSourceGroup[];
}) {
  return packAcquisitionGroups(input.context, input.groups, `acquisition:${input.context.runId}:rankings`);
}

export function rankingGroup(input: {
  context: AcquisitionBuildContext;
  sourceId: string;
  provider: string;
  canonicalUrl: string;
  payload: Record<string, JsonValue>;
  status?: string;
  error?: string | null;
}): AcquisitionSourceGroup {
  const hasPayload = Object.keys(input.payload).length > 1;
  const records: AcquisitionRecord[] = hasPayload ? [{
    schemaVersion: 1,
    kind: "ranking_observation",
    recordId: `ranking:${stableId(input.provider, "provider")}:${sha256(JSON.stringify(input.payload)).slice(0, 24)}`,
    sourceId: input.sourceId,
    externalId: `${input.provider}:${input.context.collectedAt}`,
    canonicalUrl: input.canonicalUrl,
    observedAt: input.context.collectedAt,
    contentHash: sha256(JSON.stringify(input.payload)),
    payload: input.payload,
  }] : [];
  return {
    records,
    report: report({
      sourceId: input.sourceId,
      adapter: input.provider,
      status: input.status ?? (records.length ? "success" : "failure"),
      recordCount: records.length,
      context: input.context,
      error: input.error,
    }),
  };
}
