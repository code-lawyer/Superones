import {
  CLASSIFICATION_CONFIDENCES,
  EVIDENCE_NATURES,
  PUBLISHER_KINDS,
  SOURCE_ROLES,
  type ClassificationConfidence,
  type EvidenceNature,
  type PublisherKind,
  type SourceRole,
} from "./types.ts";
export { payloadHash, signingInput } from "./batch-signing.ts";

export const CONTENT_BATCH_VERSION = 2 as const;
export const MAX_BATCH_ITEMS = 200;

export type ContentCompleteness = "metadata" | "excerpt" | "fulltext" | "transcript";
export type SourceStream = "information" | "statements";
export type OriginPlatform = "web" | "x";
export type OriginResolution = "declared" | "verified" | "unresolved";

export type InformationEnvelope = {
  idempotencyKey: string;
  sourceChannelId: string;
  discoveryPath: string;
  originalPublisher: string;
  ownerEntity?: string;
  publisherKind?: PublisherKind;
  evidenceNature?: EvidenceNature;
  classificationConfidence?: ClassificationConfidence;
  originalAuthor?: string;
  sourceRole: SourceRole;
  originalUrl: string;
  originalPublishedAt?: string;
  fetchedAt: string;
  originalLanguage: string;
  originalTitle: string;
  originalContent?: string;
  contentCompleteness: ContentCompleteness;
  contentHash: string;
  sourceStream?: SourceStream;
  originPlatform?: OriginPlatform;
  originAccount?: string;
  originContentId?: string;
  originUrl?: string;
  originResolution?: OriginResolution;
  transportKind?: string;
  transportProvider?: string;
};

export type RepositoryEnvelope = {
  githubId: number;
  owner: string;
  name: string;
  canonicalUrl: string;
  description?: string;
  readme?: string;
  readmeSha?: string;
  license?: string;
  primaryLanguage?: string;
  stars: number;
  forks: number;
  watchers: number;
  createdAt: string;
  pushedAt: string;
  fetchedAt: string;
  delta24?: number;
  delta7?: number;
};

export type InboundContentBatch = {
  version: typeof CONTENT_BATCH_VERSION;
  batchId: string;
  sourceBundleRevision: string;
  collectedFrom: string;
  collectedUntil: string;
  generatedAt: string;
  information: InformationEnvelope[];
  repositories: RepositoryEnvelope[];
};

export class ContentContractError extends Error {
  readonly code: string;

  constructor(message: string, code = "INVALID_BATCH") {
    super(message);
    this.name = "ContentContractError";
    this.code = code;
  }
}

function cleanText(value: string, limit: number) {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function requiredText(value: unknown, field: string, limit: number) {
  if (typeof value !== "string") throw new ContentContractError(`${field} 必须是文本。`);
  const result = cleanText(value, limit);
  if (!result) throw new ContentContractError(`${field} 不能为空。`);
  return result;
}

function optionalText(value: unknown, field: string, limit: number) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, field, limit);
}

function requiredDate(value: unknown, field: string) {
  const result = requiredText(value, field, 64);
  if (Number.isNaN(Date.parse(result))) throw new ContentContractError(`${field} 不是有效时间。`);
  return new Date(result).toISOString();
}

function optionalDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredDate(value, field);
}

function requiredNumber(value: unknown, field: string, minimum = 0) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new ContentContractError(`${field} 必须是不小于 ${minimum} 的有限数字。`);
  }
  return Math.round(value);
}

function httpsUrl(value: unknown, field: string) {
  const raw = requiredText(value, field, 2048);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ContentContractError(`${field} 不是有效 URL。`);
  }
  if (parsed.protocol !== "https:") throw new ContentContractError(`${field} 只接受 HTTPS URL。`);
  parsed.hash = "";
  return parsed.toString();
}

function validateInformation(value: unknown, index: number): InformationEnvelope {
  if (!value || typeof value !== "object") throw new ContentContractError(`information[${index}] 格式无效。`);
  const item = value as Record<string, unknown>;
  const sourceRole = item.sourceRole;
  if (!SOURCE_ROLES.includes(sourceRole as SourceRole)) {
    throw new ContentContractError(`information[${index}].sourceRole 无效。`);
  }
  if (item.publisherKind !== undefined && !PUBLISHER_KINDS.includes(item.publisherKind as PublisherKind)) {
    throw new ContentContractError(`information[${index}].publisherKind 无效。`);
  }
  if (item.evidenceNature !== undefined && !EVIDENCE_NATURES.includes(item.evidenceNature as EvidenceNature)) {
    throw new ContentContractError(`information[${index}].evidenceNature 无效。`);
  }
  if (item.classificationConfidence !== undefined && !CLASSIFICATION_CONFIDENCES.includes(item.classificationConfidence as ClassificationConfidence)) {
    throw new ContentContractError(`information[${index}].classificationConfidence 无效。`);
  }
  const completeness = item.contentCompleteness;
  if (!["metadata", "excerpt", "fulltext", "transcript"].includes(String(completeness))) {
    throw new ContentContractError(`information[${index}].contentCompleteness 无效。`);
  }
  const contentHash = requiredText(item.contentHash, `information[${index}].contentHash`, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new ContentContractError(`information[${index}].contentHash 必须是 SHA-256 十六进制值。`);
  }
  if (item.sourceStream !== undefined && !["information", "statements"].includes(String(item.sourceStream))) {
    throw new ContentContractError(`information[${index}].sourceStream is invalid.`);
  }
  if (item.originPlatform !== undefined && !["web", "x"].includes(String(item.originPlatform))) {
    throw new ContentContractError(`information[${index}].originPlatform is invalid.`);
  }
  if (item.originResolution !== undefined && !["declared", "verified", "unresolved"].includes(String(item.originResolution))) {
    throw new ContentContractError(`information[${index}].originResolution is invalid.`);
  }
  return {
    idempotencyKey: requiredText(item.idempotencyKey, `information[${index}].idempotencyKey`, 180),
    sourceChannelId: requiredText(item.sourceChannelId, `information[${index}].sourceChannelId`, 180),
    discoveryPath: requiredText(item.discoveryPath, `information[${index}].discoveryPath`, 500),
    originalPublisher: requiredText(item.originalPublisher, `information[${index}].originalPublisher`, 180),
    ownerEntity: optionalText(item.ownerEntity, `information[${index}].ownerEntity`, 180),
    publisherKind: item.publisherKind as PublisherKind | undefined,
    evidenceNature: item.evidenceNature as EvidenceNature | undefined,
    classificationConfidence: item.classificationConfidence as ClassificationConfidence | undefined,
    originalAuthor: optionalText(item.originalAuthor, `information[${index}].originalAuthor`, 180),
    sourceRole: sourceRole as SourceRole,
    originalUrl: httpsUrl(item.originalUrl, `information[${index}].originalUrl`),
    originalPublishedAt: optionalDate(item.originalPublishedAt, `information[${index}].originalPublishedAt`),
    fetchedAt: requiredDate(item.fetchedAt, `information[${index}].fetchedAt`),
    originalLanguage: requiredText(item.originalLanguage, `information[${index}].originalLanguage`, 32),
    originalTitle: requiredText(item.originalTitle, `information[${index}].originalTitle`, 500),
    originalContent: optionalText(item.originalContent, `information[${index}].originalContent`, 48_000),
    contentCompleteness: completeness as ContentCompleteness,
    contentHash,
    sourceStream: item.sourceStream as SourceStream | undefined,
    originPlatform: item.originPlatform as OriginPlatform | undefined,
    originAccount: optionalText(item.originAccount, `information[${index}].originAccount`, 100),
    originContentId: optionalText(item.originContentId, `information[${index}].originContentId`, 180),
    originUrl: item.originUrl ? httpsUrl(item.originUrl, `information[${index}].originUrl`) : undefined,
    originResolution: item.originResolution as OriginResolution | undefined,
    transportKind: optionalText(item.transportKind, `information[${index}].transportKind`, 80),
    transportProvider: optionalText(item.transportProvider, `information[${index}].transportProvider`, 180),
  };
}

function validateRepository(value: unknown, index: number): RepositoryEnvelope {
  if (!value || typeof value !== "object") throw new ContentContractError(`repositories[${index}] 格式无效。`);
  const item = value as Record<string, unknown>;
  const owner = requiredText(item.owner, `repositories[${index}].owner`, 100);
  const name = requiredText(item.name, `repositories[${index}].name`, 100);
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new ContentContractError(`repositories[${index}] 仓库名称格式无效。`);
  }
  const canonicalUrl = httpsUrl(item.canonicalUrl, `repositories[${index}].canonicalUrl`);
  if (canonicalUrl.replace(/\/$/, "").toLowerCase() !== `https://github.com/${owner}/${name}`.toLowerCase()) {
    throw new ContentContractError(`repositories[${index}].canonicalUrl 与仓库不匹配。`);
  }
  return {
    githubId: requiredNumber(item.githubId, `repositories[${index}].githubId`, 1),
    owner,
    name,
    canonicalUrl,
    description: optionalText(item.description, `repositories[${index}].description`, 2_000),
    readme: optionalText(item.readme, `repositories[${index}].readme`, 48_000),
    readmeSha: optionalText(item.readmeSha, `repositories[${index}].readmeSha`, 120),
    license: optionalText(item.license, `repositories[${index}].license`, 120),
    primaryLanguage: optionalText(item.primaryLanguage, `repositories[${index}].primaryLanguage`, 120),
    stars: requiredNumber(item.stars, `repositories[${index}].stars`),
    forks: requiredNumber(item.forks, `repositories[${index}].forks`),
    watchers: requiredNumber(item.watchers, `repositories[${index}].watchers`),
    createdAt: requiredDate(item.createdAt, `repositories[${index}].createdAt`),
    pushedAt: requiredDate(item.pushedAt, `repositories[${index}].pushedAt`),
    fetchedAt: requiredDate(item.fetchedAt, `repositories[${index}].fetchedAt`),
    delta24: item.delta24 === undefined ? 0 : requiredNumber(item.delta24, `repositories[${index}].delta24`),
    delta7: item.delta7 === undefined ? 0 : requiredNumber(item.delta7, `repositories[${index}].delta7`),
  };
}

export function validateContentBatch(value: unknown): InboundContentBatch {
  if (!value || typeof value !== "object") throw new ContentContractError("采集批次必须是 JSON 对象。");
  const batch = value as Record<string, unknown>;
  if (batch.version !== CONTENT_BATCH_VERSION) throw new ContentContractError("不支持的采集批次版本。", "UNSUPPORTED_VERSION");
  if (!Array.isArray(batch.information) || !Array.isArray(batch.repositories)) {
    throw new ContentContractError("information 和 repositories 必须是数组。");
  }
  if (batch.information.length + batch.repositories.length > MAX_BATCH_ITEMS) {
    throw new ContentContractError(`单个批次最多包含 ${MAX_BATCH_ITEMS} 条记录。`, "BATCH_TOO_LARGE");
  }
  const batchId = requiredText(batch.batchId, "batchId", 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,119}$/.test(batchId)) throw new ContentContractError("batchId 格式无效。");
  const collectedFrom = requiredDate(batch.collectedFrom, "collectedFrom");
  const collectedUntil = requiredDate(batch.collectedUntil, "collectedUntil");
  if (Date.parse(collectedFrom) > Date.parse(collectedUntil)) throw new ContentContractError("collectedFrom 不能晚于 collectedUntil。");
  return {
    version: CONTENT_BATCH_VERSION,
    batchId,
    sourceBundleRevision: requiredText(batch.sourceBundleRevision, "sourceBundleRevision", 120),
    collectedFrom,
    collectedUntil,
    generatedAt: requiredDate(batch.generatedAt, "generatedAt"),
    information: batch.information.map(validateInformation),
    repositories: batch.repositories.map(validateRepository),
  };
}

export function canonicalInformationKey(item: Pick<InformationEnvelope, "contentHash" | "originalUrl">) {
  return `${item.originalUrl.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase()}#${item.contentHash}`;
}
