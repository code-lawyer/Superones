export { payloadHash, signingInput } from "./batch-signing.ts";

export const ACQUISITION_BATCH_VERSION = 1 as const;
export const MAX_ACQUISITION_BATCH_BYTES = 8_000_000;
export const MAX_ACQUISITION_RECORDS = 500;
export const MAX_ACQUISITION_SOURCE_REPORTS = 512;
export const MAX_ACQUISITION_PAYLOAD_BYTES = 6 * 1024 * 1024;

export const ACQUISITION_RECORD_KINDS = [
  "information",
  "publication",
  "entity_profile",
  "repository_observation",
  "ranking_observation",
] as const;

export const ACQUISITION_SOURCE_STATUSES = [
  "succeeded",
  "partial",
  "empty",
  "failed",
] as const;

export type AcquisitionRecordKind = (typeof ACQUISITION_RECORD_KINDS)[number];
export type AcquisitionSourceStatus = (typeof ACQUISITION_SOURCE_STATUSES)[number];
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type AcquisitionRecord = {
  schemaVersion: number;
  kind: AcquisitionRecordKind;
  recordId: string;
  sourceId: string;
  externalId: string;
  canonicalUrl: string;
  observedAt: string;
  contentHash: string;
  payload: Record<string, JsonValue>;
};

export type AcquisitionSourceReport = {
  sourceId: string;
  adapter: string;
  status: AcquisitionSourceStatus;
  startedAt: string;
  completedAt: string;
  recordCount: number;
  errorCode?: string;
  errorMessage?: string;
};

export type AcquisitionBatch = {
  schemaVersion: typeof ACQUISITION_BATCH_VERSION;
  batchId: string;
  runId: string;
  registryRevision: string;
  collectedFrom: string;
  collectedUntil: string;
  collectedAt: string;
  records: AcquisitionRecord[];
  sourceReports: AcquisitionSourceReport[];
};

export class AcquisitionContractError extends Error {
  readonly code: string;

  constructor(message: string, code = "INVALID_ACQUISITION_BATCH") {
    super(message);
    this.name = "AcquisitionContractError";
    this.code = code;
  }
}

function cleanText(value: string, limit: number) {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function requiredText(value: unknown, field: string, limit: number) {
  if (typeof value !== "string") {
    throw new AcquisitionContractError(`${field} 必须是文本。`);
  }
  const result = cleanText(value, limit);
  if (!result) throw new AcquisitionContractError(`${field} 不能为空。`);
  return result;
}

function optionalText(value: unknown, field: string, limit: number) {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredText(value, field, limit);
}

function requiredDate(value: unknown, field: string) {
  const result = requiredText(value, field, 64);
  if (Number.isNaN(Date.parse(result))) {
    throw new AcquisitionContractError(`${field} 不是有效时间。`);
  }
  return new Date(result).toISOString();
}

function requiredInteger(value: unknown, field: string, minimum: number) {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new AcquisitionContractError(`${field} 必须是不小于 ${minimum} 的整数。`);
  }
  return value as number;
}

function stableId(value: unknown, field: string, limit = 180) {
  const result = requiredText(value, field, limit);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(result)) {
    throw new AcquisitionContractError(`${field} 格式无效。`);
  }
  return result;
}

function httpsUrl(value: unknown, field: string) {
  const raw = requiredText(value, field, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new AcquisitionContractError(`${field} 不是有效 URL。`);
  }
  if (parsed.protocol !== "https:") {
    throw new AcquisitionContractError(`${field} 只接受 HTTPS URL。`);
  }
  parsed.hash = "";
  return parsed.toString();
}

function contentHash(value: unknown, field: string) {
  const result = requiredText(value, field, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(result)) {
    throw new AcquisitionContractError(`${field} 必须是 SHA-256 十六进制值。`);
  }
  return result;
}

function jsonValue(value: unknown, field: string, depth = 0): JsonValue {
  if (depth > 12) {
    throw new AcquisitionContractError(`${field} 嵌套层级过深。`);
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new AcquisitionContractError(`${field} 包含无效数字。`);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => jsonValue(item, `${field}[${index}]`, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const cleanKey = requiredText(key, `${field} 的字段名`, 120);
      if (Object.hasOwn(result, cleanKey)) {
        throw new AcquisitionContractError(`${field} 包含重复字段名。`);
      }
      result[cleanKey] = jsonValue(item, `${field}.${cleanKey}`, depth + 1);
    }
    return result;
  }
  throw new AcquisitionContractError(`${field} 必须是 JSON 值。`);
}

function recordPayload(value: unknown, field: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AcquisitionContractError(`${field} 必须是 JSON 对象。`);
  }
  const result = jsonValue(value, field) as Record<string, JsonValue>;
  const bytes = new TextEncoder().encode(JSON.stringify(result)).byteLength;
  if (bytes > MAX_ACQUISITION_PAYLOAD_BYTES) {
    throw new AcquisitionContractError(
      `${field} 不得超过 ${MAX_ACQUISITION_PAYLOAD_BYTES} 字节。`,
      "RECORD_PAYLOAD_TOO_LARGE",
    );
  }
  return result;
}

function validateRecord(value: unknown, index: number): AcquisitionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AcquisitionContractError(`records[${index}] 格式无效。`);
  }
  const item = value as Record<string, unknown>;
  if (!ACQUISITION_RECORD_KINDS.includes(item.kind as AcquisitionRecordKind)) {
    throw new AcquisitionContractError(`records[${index}].kind 无效。`);
  }
  return {
    schemaVersion: requiredInteger(item.schemaVersion, `records[${index}].schemaVersion`, 1),
    kind: item.kind as AcquisitionRecordKind,
    recordId: stableId(item.recordId, `records[${index}].recordId`),
    sourceId: stableId(item.sourceId, `records[${index}].sourceId`),
    externalId: requiredText(item.externalId, `records[${index}].externalId`, 500),
    canonicalUrl: httpsUrl(item.canonicalUrl, `records[${index}].canonicalUrl`),
    observedAt: requiredDate(item.observedAt, `records[${index}].observedAt`),
    contentHash: contentHash(item.contentHash, `records[${index}].contentHash`),
    payload: recordPayload(item.payload, `records[${index}].payload`),
  };
}

function validateSourceReport(value: unknown, index: number): AcquisitionSourceReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AcquisitionContractError(`sourceReports[${index}] 格式无效。`);
  }
  const item = value as Record<string, unknown>;
  if (!ACQUISITION_SOURCE_STATUSES.includes(item.status as AcquisitionSourceStatus)) {
    throw new AcquisitionContractError(`sourceReports[${index}].status 无效。`);
  }
  const startedAt = requiredDate(item.startedAt, `sourceReports[${index}].startedAt`);
  const completedAt = requiredDate(item.completedAt, `sourceReports[${index}].completedAt`);
  if (Date.parse(startedAt) > Date.parse(completedAt)) {
    throw new AcquisitionContractError(`sourceReports[${index}] 完成时间早于开始时间。`);
  }
  return {
    sourceId: stableId(item.sourceId, `sourceReports[${index}].sourceId`),
    adapter: stableId(item.adapter, `sourceReports[${index}].adapter`),
    status: item.status as AcquisitionSourceStatus,
    startedAt,
    completedAt,
    recordCount: requiredInteger(item.recordCount, `sourceReports[${index}].recordCount`, 0),
    errorCode: optionalText(item.errorCode, `sourceReports[${index}].errorCode`, 120),
    errorMessage: optionalText(item.errorMessage, `sourceReports[${index}].errorMessage`, 1_000),
  };
}

function validateSourceAccounting(records: AcquisitionRecord[], reports: AcquisitionSourceReport[]) {
  const expectedCounts = new Map<string, number>();
  for (const record of records) {
    expectedCounts.set(record.sourceId, (expectedCounts.get(record.sourceId) ?? 0) + 1);
  }
  const reportIds = new Set<string>();
  for (const report of reports) {
    if (reportIds.has(report.sourceId)) {
      throw new AcquisitionContractError(`sourceReports 包含重复来源 ${report.sourceId}。`);
    }
    reportIds.add(report.sourceId);
    const expectedCount = expectedCounts.get(report.sourceId) ?? 0;
    if (report.recordCount !== expectedCount) {
      throw new AcquisitionContractError(
        `来源 ${report.sourceId} 的 recordCount 与 records 不一致。`,
        "SOURCE_COUNT_MISMATCH",
      );
    }
    if (report.status === "succeeded" && report.recordCount === 0) {
      throw new AcquisitionContractError(`来源 ${report.sourceId} 成功时必须包含记录。`);
    }
    if ((report.status === "empty" || report.status === "failed") && report.recordCount !== 0) {
      throw new AcquisitionContractError(`来源 ${report.sourceId} 的状态与记录数不一致。`);
    }
  }
  for (const sourceId of expectedCounts.keys()) {
    if (!reportIds.has(sourceId)) {
      throw new AcquisitionContractError(`来源 ${sourceId} 缺少 sourceReport。`);
    }
  }
}

export function validateAcquisitionBatch(value: unknown): AcquisitionBatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AcquisitionContractError("采集批次必须是 JSON 对象。");
  }
  const batch = value as Record<string, unknown>;
  if (batch.schemaVersion !== ACQUISITION_BATCH_VERSION) {
    throw new AcquisitionContractError("不支持的采集批次版本。", "UNSUPPORTED_VERSION");
  }
  if (!Array.isArray(batch.records) || !Array.isArray(batch.sourceReports)) {
    throw new AcquisitionContractError("records 和 sourceReports 必须是数组。");
  }
  if (batch.records.length > MAX_ACQUISITION_RECORDS) {
    throw new AcquisitionContractError(
      `单个批次最多包含 ${MAX_ACQUISITION_RECORDS} 条记录。`,
      "BATCH_TOO_LARGE",
    );
  }
  if (batch.sourceReports.length > MAX_ACQUISITION_SOURCE_REPORTS) {
    throw new AcquisitionContractError(
      `单个批次最多包含 ${MAX_ACQUISITION_SOURCE_REPORTS} 个来源报告。`,
      "TOO_MANY_SOURCE_REPORTS",
    );
  }
  const collectedFrom = requiredDate(batch.collectedFrom, "collectedFrom");
  const collectedUntil = requiredDate(batch.collectedUntil, "collectedUntil");
  if (Date.parse(collectedFrom) > Date.parse(collectedUntil)) {
    throw new AcquisitionContractError("collectedFrom 不能晚于 collectedUntil。");
  }
  const records = batch.records.map(validateRecord);
  const recordIds = new Set<string>();
  for (const record of records) {
    if (recordIds.has(record.recordId)) {
      throw new AcquisitionContractError(`records 包含重复记录 ${record.recordId}。`);
    }
    recordIds.add(record.recordId);
  }
  const sourceReports = batch.sourceReports.map(validateSourceReport);
  validateSourceAccounting(records, sourceReports);
  return {
    schemaVersion: ACQUISITION_BATCH_VERSION,
    batchId: stableId(batch.batchId, "batchId", 120),
    runId: stableId(batch.runId, "runId", 120),
    registryRevision: stableId(batch.registryRevision, "registryRevision", 120),
    collectedFrom,
    collectedUntil,
    collectedAt: requiredDate(batch.collectedAt, "collectedAt"),
    records,
    sourceReports,
  };
}
