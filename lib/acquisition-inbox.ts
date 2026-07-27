import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { link, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sourceBundle from "../config/source-bundle.json" with { type: "json" };
import sicRegistry from "../config/sic-source-registry.json" with { type: "json" };
import {
  AcquisitionContractError,
  MAX_ACQUISITION_BATCH_BYTES,
  payloadHash,
  signingInput,
  validateAcquisitionBatch,
  type AcquisitionBatch,
  type AcquisitionLane,
  type AcquisitionRecordKind,
  type AcquisitionRunMode,
} from "./acquisition-contract.ts";
import { pipelineSigningKeyring } from "./secret-keyring.ts";
import { configuredPostgresPool, persistenceMode } from "./state-document-store.ts";

export const ACQUISITION_INBOX_STATUSES = [
  "received",
  "processing",
  "processed",
  "retryable",
  "quarantined",
] as const;

export type AcquisitionInboxStatus = (typeof ACQUISITION_INBOX_STATUSES)[number];
export type AcquisitionFailureDisposition = "retryable" | "quarantined";

export type AcquisitionSubmission = {
  batchId: string;
  keyId?: string | null;
  timestamp: string;
  signature: string | null;
  rawPayload: string;
};

export type AcquisitionReceipt = {
  accepted: true;
  duplicate: boolean;
  status: AcquisitionInboxStatus;
  batchId: string;
  runId: string;
  lane: AcquisitionLane;
  runMode: AcquisitionRunMode;
  scheduleId: string;
  windowFrom: string;
  windowUntil: string;
  recordCount: number;
  sourceCount: number;
  kinds: Partial<Record<AcquisitionRecordKind, number>>;
};

export type AcquisitionWorkItem = {
  batch: AcquisitionBatch;
  payloadHash: string;
  rawPayload: string;
  attempt: number;
};

export type AcquisitionInboxStats = Record<AcquisitionInboxStatus, number>;

type AcquisitionInboxRecord = {
  version: 1;
  batchId: string;
  runId: string;
  lane: AcquisitionLane;
  runMode: AcquisitionRunMode;
  scheduleId: string;
  windowFrom: string;
  windowUntil: string;
  registryRevision: string;
  payloadHash: string;
  receivedAt: string;
  updatedAt: string;
  status: AcquisitionInboxStatus;
  attempts: number;
  recordCount: number;
  sourceCount: number;
  kinds: Partial<Record<AcquisitionRecordKind, number>>;
  processingStartedAt?: string;
  completedAt?: string;
  lastError?: string;
  rawPayload: string;
};

export class AcquisitionReceiveError extends Error {
  readonly code: string;
  readonly status: 400 | 401 | 409 | 413;

  constructor(message: string, code: string, status: 400 | 401 | 409 | 413) {
    super(message);
    this.name = "AcquisitionReceiveError";
    this.code = code;
    this.status = status;
  }
}

export type AcquisitionReceiverOptions = {
  inboxDirectory: string;
  signingKeys?: ReadonlyMap<string, string>;
  sharedSecret?: string;
  now?: () => Date;
  maxClockSkewMs?: number;
  processingLeaseMs?: number;
  maxAttempts?: number;
  allowedRegistryRevisions?: ReadonlySet<string>;
};

type PostgresAcquisitionReceiverOptions = Omit<AcquisitionReceiverOptions, "inboxDirectory">;

const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_PROCESSING_LEASE_MS = 15 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 3;

function persistedPath(inboxDirectory: string, batchId: string) {
  const filename = `${createHash("sha256").update(batchId).digest("hex")}.json`;
  return path.join(inboxDirectory, filename);
}

function countKinds(batch: AcquisitionBatch) {
  const result: Partial<Record<AcquisitionRecordKind, number>> = {};
  for (const record of batch.records) result[record.kind] = (result[record.kind] ?? 0) + 1;
  return result;
}

function receipt(record: AcquisitionInboxRecord, duplicate: boolean): AcquisitionReceipt {
  return {
    accepted: true,
    duplicate,
    status: record.status,
    batchId: record.batchId,
    runId: record.runId,
    lane: record.lane,
    runMode: record.runMode,
    scheduleId: record.scheduleId,
    windowFrom: record.windowFrom,
    windowUntil: record.windowUntil,
    recordCount: record.recordCount,
    sourceCount: record.sourceCount,
    kinds: record.kinds,
  };
}

function configuredSigningKeys(options: Pick<AcquisitionReceiverOptions, "signingKeys" | "sharedSecret">) {
  if (options.signingKeys?.size) {
    for (const [keyId, secret] of options.signingKeys) {
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(keyId) || Buffer.byteLength(secret, "utf8") < 32) {
        throw new Error("统一采集签名密钥环无效。");
      }
    }
    return options.signingKeys;
  }
  if (options.sharedSecret && Buffer.byteLength(options.sharedSecret, "utf8") >= 32) {
    return new Map([["legacy", options.sharedSecret]]);
  }
  throw new Error("统一采集签名密钥至少需要 32 字节。");
}

function signatureMatches(
  signingKeys: ReadonlyMap<string, string>,
  keyId: string | null | undefined,
  input: string,
  supplied: string | null,
) {
  if (!supplied || !/^sha256=[A-Za-z0-9_-]{43}$/.test(supplied)) return false;
  const selectedKeyId = keyId || (signingKeys.size === 1 && signingKeys.has("legacy") ? "legacy" : "");
  const secret = signingKeys.get(selectedKeyId);
  if (!secret) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(input).digest("base64url")}`;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function timestampSeconds(value: string, now: Date, maxClockSkewMs: number) {
  if (!/^\d{10}$/.test(value)) {
    throw new AcquisitionReceiveError("采集时间戳格式无效。", "INVALID_TIMESTAMP", 401);
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || Math.abs(now.getTime() - result * 1000) > maxClockSkewMs) {
    throw new AcquisitionReceiveError("采集时间戳已过期或超出允许时间窗。", "STALE_TIMESTAMP", 401);
  }
  return result;
}

function parseBatch(rawPayload: string, headerBatchId: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayload) as unknown;
  } catch {
    throw new AcquisitionReceiveError("采集批次不是有效 JSON。", "INVALID_JSON", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AcquisitionReceiveError("采集批次必须是 JSON 对象。", "INVALID_JSON", 400);
  }
  if ((parsed as { batchId?: unknown }).batchId !== headerBatchId) {
    throw new AcquisitionReceiveError("请求头与正文的 batchId 不一致。", "BATCH_ID_MISMATCH", 400);
  }
  try {
    return validateAcquisitionBatch(parsed);
  } catch (error) {
    if (error instanceof AcquisitionContractError) {
      const tooLarge = error.code === "BATCH_TOO_LARGE" || error.code === "RECORD_PAYLOAD_TOO_LARGE";
      throw new AcquisitionReceiveError(
        error.message,
        error.code,
        tooLarge ? 413 : 400,
      );
    }
    throw error;
  }
}

async function readPersisted(target: string) {
  const parsed = JSON.parse(await readFile(target, "utf8")) as Record<string, unknown>;
  if (parsed.version !== 1 || !parsed.batchId || !parsed.payloadHash) {
    throw new Error("持久化采集批次格式无效。");
  }
  const rawStatus = parsed.status;
  const migratedStatus = rawStatus === "pending"
    ? "received"
    : rawStatus === "succeeded"
      ? "processed"
      : rawStatus === "failed"
        ? "retryable"
        : rawStatus;
  if (!ACQUISITION_INBOX_STATUSES.includes(migratedStatus as AcquisitionInboxStatus)) {
    throw new Error("持久化采集批次状态无效。");
  }
  return { ...parsed, status: migratedStatus as AcquisitionInboxStatus } as AcquisitionInboxRecord;
}

async function persistNew(target: string, record: AcquisitionInboxRecord) {
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    await link(temporary, target);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") return false;
    throw error;
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function replacePersisted(target: string, record: AcquisitionInboxRecord) {
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, target);
}

function cleanError(value: unknown) {
  return (value instanceof Error ? value.message : String(value))
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function createAcquisitionReceiver(options: AcquisitionReceiverOptions) {
  if (!path.isAbsolute(options.inboxDirectory)) {
    throw new Error("acquisition inboxDirectory 必须是绝对路径。");
  }
  const signingKeys = configuredSigningKeys(options);
  const clock = options.now ?? (() => new Date());
  const maxClockSkewMs = options.maxClockSkewMs ?? DEFAULT_CLOCK_SKEW_MS;
  const processingLeaseMs = options.processingLeaseMs ?? DEFAULT_PROCESSING_LEASE_MS;
  const maxAttempts = Math.max(1, Math.min(20, Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)));
  let queue: Promise<unknown> = Promise.resolve();

  function serialized<T>(operation: () => Promise<T>) {
    const next = queue.then(operation, operation);
    queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async function receive(submission: AcquisitionSubmission): Promise<AcquisitionReceipt> {
    const payloadBytes = Buffer.byteLength(submission.rawPayload, "utf8");
    if (payloadBytes === 0 || payloadBytes > MAX_ACQUISITION_BATCH_BYTES) {
      throw new AcquisitionReceiveError(
        `采集批次必须介于 1 与 ${MAX_ACQUISITION_BATCH_BYTES} 字节之间。`,
        "INVALID_BODY_SIZE",
        413,
      );
    }
    const now = clock();
    timestampSeconds(submission.timestamp, now, maxClockSkewMs);
    const bodyHash = payloadHash(submission.rawPayload);
    if (!signatureMatches(
      signingKeys,
      submission.keyId,
      signingInput(submission.timestamp, submission.batchId, bodyHash),
      submission.signature,
    )) {
      throw new AcquisitionReceiveError("采集签名无效。", "INVALID_SIGNATURE", 401);
    }
    const batch = parseBatch(submission.rawPayload, submission.batchId);
    if (
      options.allowedRegistryRevisions
      && !options.allowedRegistryRevisions.has(batch.registryRevision)
    ) {
      throw new AcquisitionReceiveError(
        `来源修订 ${batch.registryRevision} 未部署。`,
        "UNKNOWN_REGISTRY_REVISION",
        409,
      );
    }
    const kinds = countKinds(batch);

    return serialized(async () => {
      await mkdir(options.inboxDirectory, { recursive: true });
      const target = persistedPath(options.inboxDirectory, batch.batchId);
      async function resolveExisting() {
        const existing = await readPersisted(target);
        if (existing.batchId !== batch.batchId || existing.payloadHash !== bodyHash) {
          throw new AcquisitionReceiveError(
            "同一 batchId 已持久化不同正文。",
            "BATCH_CONFLICT",
            409,
          );
        }
        return receipt(existing, true);
      }
      try {
        return await resolveExisting();
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
          throw error;
        }
      }

      const receivedAt = now.toISOString();
      const record: AcquisitionInboxRecord = {
        version: 1,
        batchId: batch.batchId,
        runId: batch.runId,
        lane: batch.lane,
        runMode: batch.runMode,
        scheduleId: batch.scheduleId,
        windowFrom: batch.windowFrom,
        windowUntil: batch.windowUntil,
        registryRevision: batch.registryRevision,
        payloadHash: bodyHash,
        receivedAt,
        updatedAt: receivedAt,
        status: "received",
        attempts: 0,
        recordCount: batch.records.length,
        sourceCount: batch.sourceReports.length,
        kinds,
        rawPayload: submission.rawPayload,
      };
      return await persistNew(target, record)
        ? receipt(record, false)
        : resolveExisting();
    });
  }

  async function records() {
    await mkdir(options.inboxDirectory, { recursive: true });
    return Promise.all((await readdir(options.inboxDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => ({
        target: path.join(options.inboxDirectory, entry.name),
        record: await readPersisted(path.join(options.inboxDirectory, entry.name)),
      })));
  }

  function claimNext(excludedBatchIds: ReadonlySet<string> = new Set()): Promise<AcquisitionWorkItem | null> {
    return serialized(async () => {
      const now = clock();
      const available = await records();
      available.sort((left, right) => Date.parse(left.record.receivedAt) - Date.parse(right.record.receivedAt));
      for (const item of available) {
        const leaseExpired = item.record.status === "processing"
          && Date.parse(item.record.processingStartedAt ?? item.record.updatedAt) < now.getTime() - processingLeaseMs;
        if (
          item.record.attempts >= maxAttempts
          && (item.record.status === "retryable" || leaseExpired)
        ) {
          item.record = {
            ...item.record,
            status: "quarantined",
            updatedAt: now.toISOString(),
            completedAt: now.toISOString(),
            lastError: item.record.lastError ?? "批次达到最大处理尝试次数。",
          };
          await replacePersisted(item.target, item.record);
        }
      }
      const eligible = available.filter(({ record }) => !excludedBatchIds.has(record.batchId));
      const candidate = eligible.find(({ record }) => record.status === "received")
        ?? eligible.find(({ record }) => record.status === "retryable")
        ?? available.find(({ record }) => record.status === "processing"
          && !excludedBatchIds.has(record.batchId)
          && Date.parse(record.processingStartedAt ?? record.updatedAt) < now.getTime() - processingLeaseMs);
      if (!candidate) return null;
      const claimed: AcquisitionInboxRecord = {
        ...candidate.record,
        status: "processing",
        attempts: candidate.record.attempts + 1,
        processingStartedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        lastError: undefined,
      };
      await replacePersisted(candidate.target, claimed);
      return {
        batch: validateAcquisitionBatch(JSON.parse(claimed.rawPayload) as unknown),
        payloadHash: claimed.payloadHash,
        rawPayload: claimed.rawPayload,
        attempt: claimed.attempts,
      };
    });
  }

  function complete(batchId: string) {
    return serialized(async () => {
      const target = persistedPath(options.inboxDirectory, batchId);
      const record = await readPersisted(target);
      if (record.status !== "processing") throw new Error(`批次 ${batchId} 当前不可完成。`);
      const now = clock().toISOString();
      await replacePersisted(target, {
        ...record,
        status: "processed",
        updatedAt: now,
        completedAt: now,
        lastError: undefined,
      });
    });
  }

  function fail(
    batchId: string,
    error: unknown,
    disposition: AcquisitionFailureDisposition = "retryable",
  ): Promise<AcquisitionInboxStatus> {
    return serialized(async () => {
      const target = persistedPath(options.inboxDirectory, batchId);
      const record = await readPersisted(target);
      if (record.status !== "processing") throw new Error(`批次 ${batchId} 当前不可标记失败。`);
      const status: AcquisitionInboxStatus = disposition === "quarantined" || record.attempts >= maxAttempts
        ? "quarantined"
        : "retryable";
      const now = clock().toISOString();
      await replacePersisted(target, {
        ...record,
        status,
        updatedAt: now,
        ...(status === "quarantined" ? { completedAt: now } : {}),
        lastError: cleanError(error),
      });
      return status;
    });
  }

  async function stats(): Promise<AcquisitionInboxStats> {
    const available = await records();
    return Object.fromEntries(
      ACQUISITION_INBOX_STATUSES
        .map((status) => [status, available.filter(({ record }) => record.status === status).length]),
    ) as AcquisitionInboxStats;
  }

  return { receive, claimNext, complete, fail, stats };
}

function postgresRecord(value: Record<string, unknown>): AcquisitionInboxRecord {
  const iso = (input: unknown) => input instanceof Date ? input.toISOString() : String(input);
  return {
    version: 1,
    batchId: String(value.batch_id),
    runId: String(value.run_id),
    lane: value.lane as AcquisitionLane,
    runMode: value.run_mode as AcquisitionRunMode,
    scheduleId: String(value.schedule_id),
    windowFrom: iso(value.window_from),
    windowUntil: iso(value.window_until),
    registryRevision: String(value.registry_revision),
    payloadHash: String(value.payload_hash),
    receivedAt: iso(value.received_at),
    updatedAt: iso(value.updated_at),
    status: value.status as AcquisitionInboxStatus,
    attempts: Number(value.attempts),
    recordCount: Number(value.record_count),
    sourceCount: Number(value.source_count),
    kinds: value.kinds as Partial<Record<AcquisitionRecordKind, number>>,
    ...(value.processing_started_at ? { processingStartedAt: iso(value.processing_started_at) } : {}),
    ...(value.completed_at ? { completedAt: iso(value.completed_at) } : {}),
    ...(value.last_error ? { lastError: String(value.last_error) } : {}),
    rawPayload: String(value.raw_payload),
  };
}

export function createPostgresAcquisitionReceiver(options: PostgresAcquisitionReceiverOptions) {
  const signingKeys = configuredSigningKeys(options);
  const clock = options.now ?? (() => new Date());
  const maxClockSkewMs = options.maxClockSkewMs ?? DEFAULT_CLOCK_SKEW_MS;
  const processingLeaseMs = options.processingLeaseMs ?? DEFAULT_PROCESSING_LEASE_MS;
  const maxAttempts = Math.max(1, Math.min(20, Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)));

  async function receive(submission: AcquisitionSubmission): Promise<AcquisitionReceipt> {
    const payloadBytes = Buffer.byteLength(submission.rawPayload, "utf8");
    if (payloadBytes === 0 || payloadBytes > MAX_ACQUISITION_BATCH_BYTES) {
      throw new AcquisitionReceiveError(
        `采集批次必须介于 1 与 ${MAX_ACQUISITION_BATCH_BYTES} 字节之间。`,
        "INVALID_BODY_SIZE",
        413,
      );
    }
    const now = clock();
    timestampSeconds(submission.timestamp, now, maxClockSkewMs);
    const bodyHash = payloadHash(submission.rawPayload);
    if (!signatureMatches(
      signingKeys,
      submission.keyId,
      signingInput(submission.timestamp, submission.batchId, bodyHash),
      submission.signature,
    )) {
      throw new AcquisitionReceiveError("采集签名无效。", "INVALID_SIGNATURE", 401);
    }
    const batch = parseBatch(submission.rawPayload, submission.batchId);
    if (options.allowedRegistryRevisions && !options.allowedRegistryRevisions.has(batch.registryRevision)) {
      throw new AcquisitionReceiveError(
        `来源修订 ${batch.registryRevision} 未部署。`,
        "UNKNOWN_REGISTRY_REVISION",
        409,
      );
    }
    const kinds = countKinds(batch);
    const receivedAt = now.toISOString();
    const inserted = await configuredPostgresPool().query(
      `INSERT INTO vault2077_acquisition_inbox (
        batch_id, run_id, lane, run_mode, schedule_id, window_from, window_until,
        registry_revision, payload_hash, received_at, updated_at, status, attempts,
        record_count, source_count, kinds, raw_payload
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, 'received', 0, $11, $12, $13::jsonb, $14
      ) ON CONFLICT (batch_id) DO NOTHING
      RETURNING *`,
      [
        batch.batchId,
        batch.runId,
        batch.lane,
        batch.runMode,
        batch.scheduleId,
        batch.windowFrom,
        batch.windowUntil,
        batch.registryRevision,
        bodyHash,
        receivedAt,
        batch.records.length,
        batch.sourceReports.length,
        JSON.stringify(kinds),
        submission.rawPayload,
      ],
    );
    if (inserted.rowCount) return receipt(postgresRecord(inserted.rows[0]), false);

    const existing = await configuredPostgresPool().query(
      "SELECT * FROM vault2077_acquisition_inbox WHERE batch_id = $1",
      [batch.batchId],
    );
    if (
      !existing.rowCount
      || existing.rows[0].payload_hash !== bodyHash
      || existing.rows[0].batch_id !== batch.batchId
    ) {
      throw new AcquisitionReceiveError("同一 batchId 已持久化不同正文。", "BATCH_CONFLICT", 409);
    }
    return receipt(postgresRecord(existing.rows[0]), true);
  }

  async function claimNext(excludedBatchIds: ReadonlySet<string> = new Set()): Promise<AcquisitionWorkItem | null> {
    const client = await configuredPostgresPool().connect();
    const now = clock();
    const leaseBefore = new Date(now.getTime() - processingLeaseMs).toISOString();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE vault2077_acquisition_inbox
         SET status = 'quarantined', updated_at = $1, completed_at = $1,
             last_error = coalesce(last_error, '批次达到最大处理尝试次数。')
         WHERE attempts >= $2
           AND (status = 'retryable' OR (status = 'processing' AND coalesce(processing_started_at, updated_at) < $3))`,
        [now.toISOString(), maxAttempts, leaseBefore],
      );
      const claimed = await client.query(
        `WITH candidate AS (
           SELECT batch_id
           FROM vault2077_acquisition_inbox
           WHERE NOT (batch_id = ANY($1::text[]))
             AND attempts < $2
             AND (
               status = 'received'
               OR status = 'retryable'
               OR (status = 'processing' AND coalesce(processing_started_at, updated_at) < $3)
             )
           ORDER BY
             CASE status WHEN 'received' THEN 0 WHEN 'retryable' THEN 1 ELSE 2 END,
             received_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE vault2077_acquisition_inbox AS inbox
         SET status = 'processing', attempts = attempts + 1, processing_started_at = $4,
             updated_at = $4, last_error = NULL
         FROM candidate
         WHERE inbox.batch_id = candidate.batch_id
         RETURNING inbox.*`,
        [[...excludedBatchIds], maxAttempts, leaseBefore, now.toISOString()],
      );
      await client.query("COMMIT");
      if (!claimed.rowCount) return null;
      const record = postgresRecord(claimed.rows[0]);
      return {
        batch: validateAcquisitionBatch(JSON.parse(record.rawPayload) as unknown),
        payloadHash: record.payloadHash,
        rawPayload: record.rawPayload,
        attempt: record.attempts,
      };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function complete(batchId: string) {
    const now = clock().toISOString();
    const result = await configuredPostgresPool().query(
      `UPDATE vault2077_acquisition_inbox
       SET status = 'processed', updated_at = $2, completed_at = $2, last_error = NULL
       WHERE batch_id = $1 AND status = 'processing'`,
      [batchId, now],
    );
    if (!result.rowCount) throw new Error(`批次 ${batchId} 当前不可完成。`);
  }

  async function fail(
    batchId: string,
    error: unknown,
    disposition: AcquisitionFailureDisposition = "retryable",
  ): Promise<AcquisitionInboxStatus> {
    const client = await configuredPostgresPool().connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query(
        "SELECT attempts FROM vault2077_acquisition_inbox WHERE batch_id = $1 AND status = 'processing' FOR UPDATE",
        [batchId],
      );
      if (!selected.rowCount) throw new Error(`批次 ${batchId} 当前不可标记失败。`);
      const status: AcquisitionInboxStatus = disposition === "quarantined" || Number(selected.rows[0].attempts) >= maxAttempts
        ? "quarantined"
        : "retryable";
      const now = clock().toISOString();
      await client.query(
        `UPDATE vault2077_acquisition_inbox
         SET status = $2, updated_at = $3, completed_at = CASE WHEN $2 = 'quarantined' THEN $3::timestamptz ELSE NULL END,
             last_error = $4
         WHERE batch_id = $1`,
        [batchId, status, now, cleanError(error)],
      );
      await client.query("COMMIT");
      return status;
    } catch (failure) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw failure;
    } finally {
      client.release();
    }
  }

  async function stats(): Promise<AcquisitionInboxStats> {
    const result = await configuredPostgresPool().query<{ status: AcquisitionInboxStatus; count: string }>(
      "SELECT status, count(*)::text AS count FROM vault2077_acquisition_inbox GROUP BY status",
    );
    const counts = Object.fromEntries(ACQUISITION_INBOX_STATUSES.map((status) => [status, 0])) as AcquisitionInboxStats;
    for (const row of result.rows) counts[row.status] = Number(row.count);
    return counts;
  }

  return { receive, claimNext, complete, fail, stats };
}

type ConfiguredReceiver =
  | ReturnType<typeof createAcquisitionReceiver>
  | ReturnType<typeof createPostgresAcquisitionReceiver>;

let configuredReceiver: ConfiguredReceiver | undefined;

function configuredRegistryRevisions(environment: Record<string, string | undefined>) {
  const sourceRevision = environment.VAULT2077_SOURCE_BUNDLE_REVISION?.trim()
    || (typeof sourceBundle.revision === "string" ? sourceBundle.revision : "");
  if (!sourceRevision || !Number.isInteger(sicRegistry.version)) {
    throw new Error("无法从部署配置解析统一来源修订。");
  }
  const revisions = new Set([
    `registry:${sourceRevision}:sic-v${sicRegistry.version}`,
    ...(environment.VAULT2077_ALLOWED_SOURCE_REVISIONS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ]);
  return revisions;
}

export function configuredAcquisitionReceiver() {
  if (configuredReceiver) return configuredReceiver;
  const signingKeys = pipelineSigningKeyring().keys;
  const dataRoot = process.env.VAULT2077_DATA_DIR
    ? path.resolve(process.env.VAULT2077_DATA_DIR)
    : path.join(process.cwd(), "data");
  const common = {
    signingKeys,
    maxAttempts: Number(process.env.VAULT2077_ACQUISITION_MAX_ATTEMPTS ?? DEFAULT_MAX_ATTEMPTS),
    allowedRegistryRevisions: configuredRegistryRevisions(process.env),
  };
  configuredReceiver = persistenceMode() === "postgresql"
    ? createPostgresAcquisitionReceiver(common)
    : createAcquisitionReceiver({
      ...common,
      inboxDirectory: path.join(dataRoot, "acquisition-inbox"),
    });
  return configuredReceiver;
}
