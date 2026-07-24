import "server-only";

import {
  validateContentBatch,
  type InformationEnvelope,
  type RepositoryEnvelope,
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
  persistSicExtensionSnapshot,
  type ExtensionTotal,
  type SicExtensionItem,
} from "./sic-extensions.ts";
import {
  persistGithubRankingSnapshot,
  type GithubRankItem,
} from "./sic-github-rankings.ts";
import {
  persistOfficialSicSnapshot,
  type HuggingFaceModelSnapshot,
  type OpenRouterModelSnapshot,
} from "./sic-snapshots.ts";
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

function repository(record: AcquisitionRecord): RepositoryEnvelope | null {
  const payload = record.payload;
  const target = string(payload, "target", false) ?? "vault_project";
  if (target !== "vault_project") return null;
  return {
    githubId: number(payload, "githubId"),
    owner: string(payload, "owner"),
    name: string(payload, "name"),
    canonicalUrl: record.canonicalUrl,
    description: string(payload, "description", false),
    readme: string(payload, "readme", false),
    readmeSha: string(payload, "readmeSha", false),
    license: string(payload, "license", false),
    primaryLanguage: string(payload, "primaryLanguage", false),
    stars: number(payload, "stars"),
    forks: number(payload, "forks"),
    watchers: number(payload, "watchers"),
    createdAt: string(payload, "createdAt"),
    pushedAt: string(payload, "pushedAt"),
    fetchedAt: record.observedAt,
    delta24: number(payload, "delta24", 0),
    delta7: number(payload, "delta7", 0),
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

function huggingFaceModels(payload: JsonObject): HuggingFaceModelSnapshot[] {
  return array(payload, "items").map((value, index) => {
    const item = object(value, `items[${index}]`);
    return {
      id: string(item, "id"),
      name: string(item, "name"),
      downloadsAllTime: number(item, "downloadsAllTime"),
    };
  });
}

function openRouterModels(payload: JsonObject): OpenRouterModelSnapshot[] {
  return array(payload, "items").map((value, index) => {
    const item = object(value, `items[${index}]`);
    return { id: string(item, "id"), name: string(item, "name") };
  });
}

function githubItems(payload: JsonObject): GithubRankItem[] {
  return array(payload, "items").map((value, index) => {
    const item = object(value, `items[${index}]`);
    return {
      owner: string(item, "owner"),
      repo: string(item, "repo"),
      stars: number(item, "stars"),
      delta24: number(item, "delta24", 0),
      delta7: number(item, "delta7", 0),
      description: string(item, "description"),
      license: string(item, "license"),
    };
  });
}

function extensionItems(payload: JsonObject, field: string): SicExtensionItem[] {
  return array(payload, field).map((value, index) => {
    const item = object(value, `${field}[${index}]`);
    return {
      id: string(item, "id"),
      name: string(item, "name"),
      value: number(item, "value"),
      href: https(item, "href"),
    };
  });
}

function extensionTotals(payload: JsonObject): ExtensionTotal[] {
  return array(payload, "totals").map((value, index) => {
    const item = object(value, `totals[${index}]`);
    return {
      id: string(item, "id"),
      name: string(item, "name"),
      value: number(item, "value"),
      total: number(item, "total"),
      href: https(item, "href"),
    };
  });
}

type RankingAdapters = {
  persistOfficial: typeof persistOfficialSicSnapshot;
  persistGithub: typeof persistGithubRankingSnapshot;
  persistExtensions: typeof persistSicExtensionSnapshot;
};

async function processRankings(records: AcquisitionRecord[], adapters: RankingAdapters) {
  const providers = new Set<string>();
  for (const record of records) {
    const provider = string(record.payload, "provider");
    if (providers.has(provider)) throw new Error(`统一批次包含重复榜单 provider：${provider}。`);
    providers.add(provider);
    if (provider === "hugging_face") {
      await adapters.persistOfficial({
        capturedAt: record.observedAt,
        huggingFace: huggingFaceModels(record.payload),
      });
    } else if (provider === "openrouter") {
      await adapters.persistOfficial({
        capturedAt: record.observedAt,
        openRouter: openRouterModels(record.payload),
      });
    } else if (["github_trending", "github_24h", "github_7d"].includes(provider)) {
      const items = githubItems(record.payload);
      await adapters.persistGithub({
        capturedAt: record.observedAt,
        trending: provider === "github_trending" ? { capturedAt: record.observedAt, items } : null,
        daily: provider === "github_24h" ? { capturedAt: record.observedAt, items } : null,
        weekly: provider === "github_7d" ? { capturedAt: record.observedAt, items } : null,
      });
    } else if (provider === "skills") {
      await adapters.persistExtensions({
        capturedAt: record.observedAt,
        skills: {
          selected: extensionItems(record.payload, "selected"),
          totals: extensionTotals(record.payload),
        },
      });
    } else if (provider === "mcps") {
      await adapters.persistExtensions({
        capturedAt: record.observedAt,
        mcps: {
          selected: extensionItems(record.payload, "selected"),
          totals: extensionTotals(record.payload),
        },
      });
    } else {
      throw new Error(`未知榜单 provider：${provider}。`);
    }
  }
}

export function createAcquisitionBatchProcessor(input: {
  processContent?: (
    value: unknown,
    bodyHash: string,
    options?: { requireNoQuarantine?: boolean },
  ) => Promise<unknown>;
  processPublications?: (value: unknown, fetcher: typeof fetch) => Promise<unknown>;
  persistOfficialRankings?: RankingAdapters["persistOfficial"];
  persistGithubRankings?: RankingAdapters["persistGithub"];
  persistExtensionRankings?: RankingAdapters["persistExtensions"];
  recordFrontierSnapshots?: typeof recordStarSnapshots;
} = {}): AcquisitionBatchProcessor {
  const processContent = input.processContent ?? processInboundContent;
  const processPublications = input.processPublications ?? ingestSicAcquisitionContent;
  const rankingAdapters: RankingAdapters = {
    persistOfficial: input.persistOfficialRankings ?? persistOfficialSicSnapshot,
    persistGithub: input.persistGithubRankings ?? persistGithubRankingSnapshot,
    persistExtensions: input.persistExtensionRankings ?? persistSicExtensionSnapshot,
  };
  const persistFrontier = input.recordFrontierSnapshots ?? recordStarSnapshots;

  return async (batch, work) => {
    const informationRecords = batch.records.filter((record) => record.kind === "information");
    const repositoryRecords = batch.records.filter((record) => record.kind === "repository_observation");
    const publicationRecords = batch.records.filter((record) => record.kind === "publication");
    const profiles = batch.records.filter((record) => record.kind === "entity_profile");
    const rankings = batch.records.filter((record) => record.kind === "ranking_observation");
    const repositories = repositoryRecords.flatMap((record) => {
      const value = repository(record);
      return value ? [value] : [];
    });
    const frontierRecords = repositoryRecords.filter((record) => repositoryTarget(record) === "frontier");

    if (informationRecords.length > 0 || repositories.length > 0) {
      const legacy = validateContentBatch({
        version: 2,
        batchId: batch.batchId,
        sourceBundleRevision: batch.registryRevision,
        collectedFrom: batch.collectedFrom,
        collectedUntil: batch.collectedUntil,
        generatedAt: batch.collectedAt,
        information: informationRecords.map(information),
        repositories,
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

    if (rankings.length > 0) await processRankings(rankings, rankingAdapters);

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

    const recognizedRepositories = repositories.length + frontierRecords.length;
    if (profiles.length > 0 || recognizedRepositories !== repositoryRecords.length) {
      const unsupported = profiles.length
        ? `${profiles.length} profiles`
        : `${repositoryRecords.length - recognizedRepositories} repositories`;
      throw new Error(`统一处理 adapter 尚未覆盖：${unsupported}。`);
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
