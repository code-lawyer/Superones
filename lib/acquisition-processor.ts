import "server-only";

import sourceBundle from "../config/source-bundle.json" with { type: "json" };
import { acquisitionSourceIds } from "./acquisition-source-registry.ts";
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
import { assertAcquisitionLaneKinds } from "./acquisition-contract.ts";
import {
  applyFrontierVerificationObservation,
  recordStarSnapshots,
  rejectPendingSubmission,
} from "./frontier-store.ts";
import { completeFrontierObservationTasks } from "./frontier-public-tasks.ts";
import { repositoryEligibilityError } from "./frontier-service.ts";
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
import {
  AcquisitionQuarantineError,
  type AcquisitionBatchProcessor,
} from "./acquisition-worker.ts";

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

function boolean(payload: JsonObject, field: string) {
  const value = payload[field];
  if (typeof value === "boolean") return value;
  throw new Error(`统一采集记录的 ${field} 无效。`);
}

function optionalBoolean(payload: JsonObject, field: string) {
  const value = payload[field];
  if (value === undefined || value === null) return undefined;
  return boolean(payload, field);
}

function optionalInteger(payload: JsonObject, field: string, minimum: number) {
  const value = payload[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isInteger(value) && value >= minimum) return value;
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

function optionalHttps(payload: JsonObject, field: string) {
  const value = string(payload, field, false);
  if (!value) return undefined;
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error(`统一采集记录的 ${field} 必须使用 HTTPS。`);
  parsed.hash = "";
  return parsed.toString();
}

export function informationFromAcquisitionRecord(record: AcquisitionRecord): InformationEnvelope {
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
    externalUrl: optionalHttps(payload, "externalUrl"),
    originalPublishedAt: string(payload, "originalPublishedAt", false),
    fetchedAt: record.observedAt,
    originalLanguage: string(payload, "originalLanguage"),
    originalTitle: string(payload, "originalTitle"),
    originalContent: string(payload, "originalContent", false),
    contentFormat: string(payload, "contentFormat", false) as InformationEnvelope["contentFormat"],
    contentCompleteness: string(payload, "contentCompleteness") as InformationEnvelope["contentCompleteness"],
    contentHash: record.contentHash,
    contentGroup: string(payload, "contentGroup", false) as InformationEnvelope["contentGroup"],
    itemKind: string(payload, "itemKind", false) as InformationEnvelope["itemKind"],
    releasePrerelease: optionalBoolean(payload, "releasePrerelease"),
    releaseDraft: optionalBoolean(payload, "releaseDraft"),
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
    contentClass: string(payload, "contentClass", false) as InformationEnvelope["contentClass"],
    eventEligible: optionalBoolean(payload, "eventEligible"),
  };
}

function repositoryTarget(record: AcquisitionRecord) {
  return string(record.payload, "target", false) ?? "vault_project";
}

function frontierObservation(record: AcquisitionRecord) {
  const payload = record.payload;
  const taskKind = (string(payload, "taskKind", false) ?? "observe_stars") as (
    "inspect_submission" | "verify_submission" | "observe_stars"
  );
  if (!["inspect_submission", "verify_submission", "observe_stars"].includes(taskKind)) {
    throw new Error("Frontier 公开任务类型无效。");
  }
  return {
    taskKind,
    season: string(payload, "season"),
    submissionId: string(payload, "submissionId"),
    stars: number(payload, "stars"),
    defaultBranch: taskKind === "observe_stars"
      ? string(payload, "defaultBranch", false)
      : string(payload, "defaultBranch"),
    isFork: taskKind === "observe_stars" ? false : boolean(payload, "isFork"),
    isArchived: taskKind === "observe_stars" ? false : boolean(payload, "isArchived"),
    isPrivate: taskKind === "observe_stars" ? false : boolean(payload, "isPrivate"),
    license: payload.license === null ? null : string(payload, "license", false) ?? null,
    challenge: string(payload, "challenge", false),
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
    rankingWeek: string(payload, "rankingWeek", false),
    weeklyRank: optionalInteger(payload, "weeklyRank", 1),
    weeklyUpvotes: optionalInteger(payload, "weeklyUpvotes", 0),
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

const DIRECT_PROVIDERS = new Set<DirectRankingProvider>(["github", "hugging_face", "openrouter"]);

function legacyActiveSourceIds(lane: "information" | "roadside") {
  return sourceBundle.sources
    .filter((source) => {
      const sourceLane = source.contentGroup === "roadside"
        || ["roadside", "statements"].includes(source.sourceStream ?? "")
        ? "roadside"
        : "information";
      return sourceLane === lane;
    })
    .map((source) => source.id);
}

type RecordAdaptation<T> = {
  values: T[];
  failedRecordIdsBySource: Map<string, Set<string>>;
  errorsBySource: Map<string, string[]>;
};

function adaptRecords<T>(
  records: AcquisitionRecord[],
  adapter: (record: AcquisitionRecord) => T,
): RecordAdaptation<T> {
  const values: T[] = [];
  const failedRecordIdsBySource = new Map<string, Set<string>>();
  const errorsBySource = new Map<string, string[]>();
  for (const record of records) {
    try {
      values.push(adapter(record));
    } catch (error) {
      const failedIds = failedRecordIdsBySource.get(record.sourceId) ?? new Set<string>();
      failedIds.add(record.recordId);
      failedRecordIdsBySource.set(record.sourceId, failedIds);
      const messages = errorsBySource.get(record.sourceId) ?? [];
      messages.push(`${record.recordId}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500));
      errorsBySource.set(record.sourceId, messages);
    }
  }
  return { values, failedRecordIdsBySource, errorsBySource };
}

function reportsAfterAdaptation(
  reports: AcquisitionBatch["sourceReports"],
  records: AcquisitionRecord[],
  adaptation: Pick<RecordAdaptation<unknown>, "failedRecordIdsBySource" | "errorsBySource">,
) {
  const validBySource = new Map<string, number>();
  for (const record of records) {
    if (adaptation.failedRecordIdsBySource.get(record.sourceId)?.has(record.recordId)) continue;
    validBySource.set(record.sourceId, (validBySource.get(record.sourceId) ?? 0) + 1);
  }
  return reports.map((report) => {
    const messages = adaptation.errorsBySource.get(report.sourceId) ?? [];
    if (messages.length === 0) return report;
    const recordCount = validBySource.get(report.sourceId) ?? 0;
    return {
      ...report,
      status: recordCount > 0 ? "partial" as const : "failed" as const,
      recordCount,
      errorCode: recordCount > 0 ? "DOMESTIC_ADAPTER_PARTIAL" : "DOMESTIC_ADAPTER_FAILED",
      errorMessage: messages.join(" | ").slice(0, 1_000),
    };
  });
}

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
  reports: AcquisitionBatch["sourceReports"],
  collectedAt: string,
  persist: typeof persistDirectRankingBoards,
) {
  const adapted = adaptRecords(records, directRankingBoard);
  const sourceReports = reportsAfterAdaptation(reports, records, adapted);
  const ids = new Set<string>();
  const boards = adapted.values.filter((board) => {
    if (ids.has(board.id)) return false;
    ids.add(board.id);
    return true;
  });
  await persist(boards, sourceReports.map((report) => ({
    sourceId: report.sourceId,
    status: report.status,
    collectedAt,
    errorCode: report.errorCode,
    errorMessage: report.errorMessage,
  })));
  return boards.length;
}

export function createAcquisitionBatchProcessor(input: {
  processContent?: (
    value: unknown,
    bodyHash: string,
    options?: Parameters<typeof processInboundContent>[2],
  ) => Promise<unknown>;
  processPublications?: (
    value: unknown,
    fetcher: typeof fetch,
    options?: { activeSourceIds?: string[]; editorialDeadlineAt?: number; runMode?: "bootstrap" | "incremental" },
  ) => Promise<unknown>;
  persistDirectRankings?: typeof persistDirectRankingBoards;
  recordFrontierSnapshots?: typeof recordStarSnapshots;
  applyFrontierVerification?: typeof applyFrontierVerificationObservation;
  rejectFrontierSubmission?: typeof rejectPendingSubmission;
  completeFrontierFallbackTasks?: typeof completeFrontierObservationTasks;
} = {}): AcquisitionBatchProcessor {
  const processContent = input.processContent ?? processInboundContent;
  const processPublications = input.processPublications ?? ingestSicAcquisitionContent;
  const persistRankings = input.persistDirectRankings ?? persistDirectRankingBoards;
  const persistFrontier = input.recordFrontierSnapshots ?? recordStarSnapshots;
  const applyFrontierVerification = input.applyFrontierVerification ?? applyFrontierVerificationObservation;
  const rejectFrontierSubmission = input.rejectFrontierSubmission ?? rejectPendingSubmission;
  const completeFrontierFallback = input.completeFrontierFallbackTasks ?? completeFrontierObservationTasks;

  return async (batch, work) => {
    assertAcquisitionLaneKinds(batch.lane, batch.records);
    const informationRecords = batch.records.filter((record) => record.kind === "information");
    const repositoryRecords = batch.records.filter((record) => record.kind === "repository_observation");
    const publicationRecords = batch.records.filter((record) => record.kind === "publication");
    const profiles = batch.records.filter((record) => record.kind === "entity_profile");
    const rankings = batch.records.filter((record) => record.kind === "ranking_observation");
    const frontierRecords = repositoryRecords.filter((record) => repositoryTarget(record) === "frontier");

    const unsupportedCount = profiles.length + repositoryRecords.length - frontierRecords.length;
    const supportedCount = informationRecords.length + publicationRecords.length + rankings.length + frontierRecords.length;
    if (unsupportedCount > 0 && supportedCount === 0) {
      const unsupported = profiles.length
        ? `${profiles.length} profiles`
        : `${repositoryRecords.length - frontierRecords.length} repositories`;
      throw new AcquisitionQuarantineError(
        `统一处理 adapter 尚未覆盖：${unsupported}。`,
        "UNSUPPORTED_RECORD_ADAPTER",
      );
    }

    let processedInformation = 0;
    let processedPublications = 0;
    let processedRankings = 0;
    let processedRepositories = 0;

    if (batch.lane === "information" || batch.lane === "roadside") {
      const adapted = adaptRecords(informationRecords, informationFromAcquisitionRecord);
      const sourceReports = reportsAfterAdaptation(batch.sourceReports, informationRecords, adapted);
      const legacy = validateContentBatch({
        version: 2,
        batchId: batch.batchId,
        sourceBundleRevision: batch.registryRevision,
        collectedFrom: batch.collectedFrom,
        collectedUntil: batch.collectedUntil,
        generatedAt: batch.collectedAt,
        information: adapted.values,
        repositories: [],
      });
      await processContent(legacy, work.payloadHash, {
        requireNoQuarantine: false,
        snapshot: {
          contentGroup: batch.lane,
          runMode: batch.runMode,
          runId: batch.runId,
          collectedAt: batch.collectedAt,
          activeSourceIds: batch.sourceRegistry
            ? acquisitionSourceIds(batch.sourceRegistry)
            : legacyActiveSourceIds(batch.lane),
          sourceReports: sourceReports.map((report) => ({
            sourceId: report.sourceId,
            status: report.status,
            collectedAt: batch.collectedAt,
            errorCode: report.errorCode,
            errorMessage: report.errorMessage,
          })),
        },
      });
      processedInformation = adapted.values.length;
    }

    if (batch.lane === "sic") {
      const adapted = adaptRecords(publicationRecords, publication);
      const sourceReports = reportsAfterAdaptation(batch.sourceReports, publicationRecords, adapted);
      const packet: SicRawCollection = {
        version: 1,
        snapshotId: batch.runId,
        collectedAt: batch.collectedAt,
        items: adapted.values,
        reports: sourceReports.map((report) => publicationReport(report, batch.collectedAt)),
      };
      await processPublications(packet, blockedDomesticFetch, {
        activeSourceIds: batch.sourceRegistry
          ? acquisitionSourceIds(batch.sourceRegistry)
          : undefined,
        editorialDeadlineAt: work.deadlineAt,
        runMode: batch.runMode,
      });
      processedPublications = adapted.values.length;
    }

    const rankingSourceIds = new Set(rankings.map((record) => record.sourceId));
    const rankingReports = batch.sourceReports.filter((report) => (
      report.sourceId.startsWith("ranking:") || rankingSourceIds.has(report.sourceId)
    ));
    if (rankings.length > 0 || rankingReports.length > 0) {
      processedRankings = await processRankings(
        rankings,
        rankingReports,
        batch.collectedAt,
        persistRankings,
      );
    }

    const frontierBySeason = new Map<string, Array<{ submissionId: string; stars: number }>>();
    const completedFrontierTasks: string[] = [];
    for (const record of frontierRecords) {
      try {
        const value = frontierObservation(record);
        if (value.taskKind === "observe_stars") {
          const entries = frontierBySeason.get(value.season) ?? [];
          entries.push({ submissionId: value.submissionId, stars: value.stars });
          frontierBySeason.set(value.season, entries);
        } else {
          const eligibilityError = repositoryEligibilityError({
            owner: record.canonicalUrl,
            repo: record.canonicalUrl,
            fullName: record.canonicalUrl,
            defaultBranch: value.defaultBranch!,
            stars: value.stars,
            isFork: value.isFork,
            isArchived: value.isArchived,
            isPrivate: value.isPrivate,
            license: value.license,
          });
          if (eligibilityError) {
            await rejectFrontierSubmission(value.submissionId, eligibilityError);
          } else {
            const outcome = await applyFrontierVerification({
              submissionId: value.submissionId,
              season: value.season,
              defaultBranch: value.defaultBranch!,
              stars: value.stars,
              challenge: value.taskKind === "verify_submission" ? value.challenge : undefined,
              capturedAt: batch.collectedAt,
            });
            const terminalVerificationOutcomes = new Set([
              "verified",
              "challenge-expired",
              "season-closed",
              "missing",
              "ineligible",
            ]);
            if (value.taskKind === "verify_submission" && !terminalVerificationOutcomes.has(outcome)) {
              throw new Error(`Frontier 异步验证未完成：${outcome}。`);
            }
          }
        }
        completedFrontierTasks.push(value.submissionId);
        processedRepositories += 1;
      } catch {
        // Malformed observations are isolated; valid observations still publish.
      }
    }
    for (const [season, updates] of frontierBySeason) {
      await persistFrontier(season, updates, batch.collectedAt);
    }
    if (completedFrontierTasks.length > 0) {
      await completeFrontierFallback(completedFrontierTasks);
    }

    return {
      information: processedInformation,
      publications: processedPublications,
      profiles: 0,
      repositories: processedRepositories,
      rankings: processedRankings,
    };
  };
}
