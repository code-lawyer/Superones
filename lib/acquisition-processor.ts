import "server-only";

import {
  validateContentBatch,
  type InformationEnvelope,
} from "./content-contract.ts";
import { processInboundContent } from "./content-pipeline.ts";
import type {
  AcquisitionBatch,
  AcquisitionRecord,
  JsonValue,
} from "./acquisition-contract.ts";
import { recordStarSnapshots } from "./frontier-store.ts";
import {
  ingestSicAcquisitionContent,
  type SicRawCollection,
  type SicRawContentItem,
} from "./sic-collector.ts";
import type { SicSourceCollectionReport } from "./sic-content-types.ts";
import {
  persistDirectRankingBoards,
  type DirectRankingBoard,
  type DirectRankingItem,
  type DirectRankingProvider,
} from "./direct-rankings.ts";
import type { AcquisitionBatchProcessor } from "./acquisition-worker.ts";

type JsonObject = Record<string, JsonValue>;

function string(payload: JsonObject, field: string): string;
function string(payload: JsonObject, field: string, required: true): string;
function string(payload: JsonObject, field: string, required: false): string | undefined;
function string(payload: JsonObject, field: string, required = true) {
  const value = payload[field];
  if (typeof value === "string" && value.trim()) return value;
  if (!required && (value === undefined || value === null || value === "")) return undefined;
  throw new Error(`统一采集记录缺少 ${field}。`);
}

function number(payload: JsonObject, field: string, fallback?: number) {
  const value = payload[field];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (fallback !== undefined && (value === undefined || value === null)) return fallback;
  throw new Error(`统一采集记录的 ${field} 无效。`);
}

function object(value: JsonValue | undefined, field: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`统一采集记录的 ${field} 必须是对象。`);
  }
  return value;
}

function array(payload: JsonObject, field: string) {
  const value = payload[field];
  if (!Array.isArray(value)) throw new Error(`统一采集记录的 ${field} 必须是数组。`);
  return value;
}

function optionalStringArray(payload: JsonObject, field: string) {
  const value = payload[field];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`统一采集记录的 ${field} 必须是文本数组。`);
  }
  return value as string[];
}

function https(payload: JsonObject, field: string) {
  const value = string(payload, field);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error(`统一采集记录的 ${field} 必须使用 HTTPS。`);
  return parsed.toString();
}

function information(record: AcquisitionRecord): InformationEnvelope {
  const payload = record.payload;
  return {
    idempotencyKey: record.recordId,
    sourceChannelId: record.sourceId,
    discoveryPath: string(payload, "discoveryPath"),
    discoveryPaths: optionalStringArray(payload, "discoveryPaths"),
    originalPublisher: string(payload, "originalPublisher"),
    ownerEntity: string(payload, "ownerEntity", false),
    publisherKind: string(payload, "publisherKind", false) as InformationEnvelope["publisherKind"],
    evidenceNature: string(payload, "evidenceNature", false) as InformationEnvelope["evidenceNature"],
    classificationConfidence: string(payload, "classificationConfidence", false) as InformationEnvelope["classificationConfidence"],
    originalAuthor: string(payload, "originalAuthor", false),
    sourceRole: string(payload, "sourceRole") as InformationEnvelope["sourceRole"],
    originalUrl: record.canonicalUrl,
    originalPublishedAt: string(payload, "originalPublishedAt", false),
    fetchedAt: record.observedAt,
    originalLanguage: string(payload, "originalLanguage"),
    originalTitle: string(payload, "originalTitle"),
    originalContent: string(payload, "originalContent", false),
    contentCompleteness: string(payload, "contentCompleteness") as InformationEnvelope["contentCompleteness"],
    contentHash: record.contentHash,
    contentGroup: string(payload, "contentGroup", false) as InformationEnvelope["contentGroup"],
    itemKind: string(payload, "itemKind", false) as InformationEnvelope["itemKind"],
    provenanceRole: string(payload, "provenanceRole", false) as InformationEnvelope["provenanceRole"],
    provenanceStatus: string(payload, "provenanceStatus", false) as InformationEnvelope["provenanceStatus"],
    sourceStream: string(payload, "sourceStream", false) as InformationEnvelope["sourceStream"],
    originPlatform: string(payload, "originPlatform", false) as InformationEnvelope["originPlatform"],
    originAccount: string(payload, "originAccount", false),
    originContentId: string(payload, "originContentId", false),
    originUrl: string(payload, "originUrl", false),
    originResolution: string(payload, "originResolution", false) as InformationEnvelope["originResolution"],
    transportKind: string(payload, "transportKind", false),
    transportProvider: string(payload, "transportProvider", false),
  };
}

function repositoryTarget(record: AcquisitionRecord) {
  return string(record.payload, "target", false) ?? "vault_project";
}

function frontierObservation(record: AcquisitionRecord) {
  const payload = record.payload;
  return {
    season: string(payload, "season"),
    submissionId: string(payload, "submissionId"),
    stars: number(payload, "stars"),
  };
}

function publication(record: AcquisitionRecord): SicRawContentItem {
  const payload = record.payload;
  return {
    id: record.externalId,
    sourceId: record.sourceId,
    group: string(payload, "group") as SicRawContentItem["group"],
    sourceName: string(payload, "sourceName"),
    publisher: string(payload, "publisher"),
    title: string(payload, "title"),
    summary: string(payload, "summary"),
    sourceMaterial: string(payload, "sourceMaterial", false),
    url: record.canonicalUrl,
    publishedAt: string(payload, "publishedAt", false) ?? null,
    collectedAt: record.observedAt,
    canonicalId: string(payload, "canonicalId", false),
    discoveryUrl: string(payload, "discoveryUrl", false),
    provenanceStatus: string(payload, "provenanceStatus", false) as SicRawContentItem["provenanceStatus"],
  };
}

function publicationReport(
  report: AcquisitionBatch["sourceReports"][number],
  collectedAt: string,
): SicSourceCollectionReport {
  return {
    sourceId: report.sourceId,
    status: report.status === "empty"
      ? "empty"
      : report.status === "failed"
        ? "failure"
        : report.status === "partial"
          ? "partial"
          : "success",
    collectedAt,
    itemCount: report.recordCount,
    error: report.errorMessage,
  };
}

const blockedDomesticFetch: typeof fetch = async () => {
  throw new Error("统一境内处理禁止回源访问境外页面。");
};

const DIRECT_PROVIDERS = new Set<DirectRankingProvider>(["github", "hugging_face", "openrouter", "skills"]);

function directRankingBoard(record: AcquisitionRecord): DirectRankingBoard {
  const payload = record.payload;
  const provider = string(payload, "provider") as DirectRankingProvider;
  if (!DIRECT_PROVIDERS.has(provider)) throw new Error(`未知榜单 provider：${provider}。`);
  const providerView = string(payload, "providerView");
  const sourceUrl = https(payload, "sourceUrl");
  let previousRank = 0;
  const values = array(payload, "items").map((value, index): DirectRankingItem => {
    const ranking = object(value, `items[${index}]`);
    const providerRank = number(ranking, "providerRank");
    if (!Number.isInteger(providerRank) || providerRank <= previousRank) {
      throw new Error(`${provider}/${providerView} 的 providerRank 与平台返回顺序不一致。`);
    }
    previousRank = providerRank;
    const itemProvider = string(ranking, "provider") as DirectRankingProvider;
    if (itemProvider !== provider || string(ranking, "providerView") !== providerView) {
      throw new Error(`${provider}/${providerView} 的榜单条目来源标识不一致。`);
    }
    const rawValue = ranking.value;
    return {
      id: string(ranking, "id"),
      name: string(ranking, "name"),
      provider,
      providerView,
      providerRank,
      providerMetric: string(ranking, "providerMetric"),
      value: rawValue === null ? null : number(ranking, "value"),
      capturedAt: string(ranking, "capturedAt"),
      sourceUrl: https(ranking, "sourceUrl"),
      itemUrl: https(ranking, "itemUrl"),
      description: string(ranking, "description", false),
    };
  });
  return {
    id: string(payload, "id"),
    provider,
    providerView,
    title: string(payload, "title"),
    eyebrow: string(payload, "eyebrow"),
    providerMetric: string(payload, "providerMetric"),
    capturedAt: record.observedAt,
    sourceUrl,
    items: values,
  };
}

async function processRankings(
  records: AcquisitionRecord[],
  persist: typeof persistDirectRankingBoards,
) {
  const boards = records.map(directRankingBoard);
  const ids = new Set<string>();
  for (const board of boards) {
    if (ids.has(board.id)) throw new Error(`统一批次包含重复榜单视图：${board.id}。`);
    ids.add(board.id);
  }
  await persist(boards);
}

export function createAcquisitionBatchProcessor(input: {
  processContent?: (
    value: unknown,
    bodyHash: string,
    options?: { requireNoQuarantine?: boolean },
  ) => Promise<unknown>;
  processPublications?: (value: unknown, fetcher: typeof fetch) => Promise<unknown>;
  persistDirectRankings?: typeof persistDirectRankingBoards;
  recordFrontierSnapshots?: typeof recordStarSnapshots;
} = {}): AcquisitionBatchProcessor {
  const processContent = input.processContent ?? processInboundContent;
  const processPublications = input.processPublications ?? ingestSicAcquisitionContent;
  const persistRankings = input.persistDirectRankings ?? persistDirectRankingBoards;
  const persistFrontier = input.recordFrontierSnapshots ?? recordStarSnapshots;

  return async (batch, work) => {
    const informationRecords = batch.records.filter((record) => record.kind === "information");
    const repositoryRecords = batch.records.filter((record) => record.kind === "repository_observation");
    const publicationRecords = batch.records.filter((record) => record.kind === "publication");
    const profiles = batch.records.filter((record) => record.kind === "entity_profile");
    const rankings = batch.records.filter((record) => record.kind === "ranking_observation");
    const frontierRecords = repositoryRecords.filter((record) => repositoryTarget(record) === "frontier");

    if (profiles.length > 0 || frontierRecords.length !== repositoryRecords.length) {
      const unsupported = profiles.length
        ? `${profiles.length} profiles`
        : `${repositoryRecords.length - frontierRecords.length} repositories`;
      throw new Error(`统一处理 adapter 尚未覆盖：${unsupported}。`);
    }

    if (informationRecords.length > 0) {
      const legacy = validateContentBatch({
        version: 2,
        batchId: batch.batchId,
        sourceBundleRevision: batch.registryRevision,
        collectedFrom: batch.collectedFrom,
        collectedUntil: batch.collectedUntil,
        generatedAt: batch.collectedAt,
        information: informationRecords.map(information),
        repositories: [],
      });
      await processContent(legacy, work.payloadHash, { requireNoQuarantine: true });
    }

    if (publicationRecords.length > 0) {
      const publicationSourceIds = new Set(publicationRecords.map((record) => record.sourceId));
      const packet: SicRawCollection = {
        version: 1,
        collectedAt: batch.collectedAt,
        items: publicationRecords.map(publication),
        reports: batch.sourceReports
          .filter((report) => publicationSourceIds.has(report.sourceId))
          .map((report) => publicationReport(report, batch.collectedAt)),
      };
      await processPublications(packet, blockedDomesticFetch);
    }

    if (rankings.length > 0) await processRankings(rankings, persistRankings);

    const frontierBySeason = new Map<string, Array<{ submissionId: string; stars: number }>>();
    for (const record of frontierRecords) {
      const value = frontierObservation(record);
      const entries = frontierBySeason.get(value.season) ?? [];
      entries.push({ submissionId: value.submissionId, stars: value.stars });
      frontierBySeason.set(value.season, entries);
    }
    for (const [season, updates] of frontierBySeason) {
      await persistFrontier(season, updates, batch.collectedAt);
    }

    return {
      information: informationRecords.length,
      publications: publicationRecords.length,
      profiles: 0,
      repositories: repositoryRecords.length,
      rankings: rankings.length,
    };
  };
}
