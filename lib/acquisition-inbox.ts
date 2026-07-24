import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { link, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AcquisitionContractError,
  MAX_ACQUISITION_BATCH_BYTES,
  payloadHash,
  signingInput,
  validateAcquisitionBatch,
  type AcquisitionBatch,
  type AcquisitionRecordKind,
} from "./acquisition-contract.ts";

export type AcquisitionInboxStatus = "pending" | "processing" | "succeeded" | "failed";

export type AcquisitionSubmission = {
  batchId: string;
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
  sharedSecret: string;
  now?: () => Date;
  maxClockSkewMs?: number;
  processingLeaseMs?: number;
};

const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_PROCESSING_LEASE_MS = 15 * 60 * 1000;

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
    recordCount: record.recordCount,
    sourceCount: record.sourceCount,
    kinds: record.kinds,
  };
}

function signatureMatches(secret: string, input: string, supplied: string | null) {
  if (!supplied || !/^sha256=[A-Za-z0-9_-]{43}$/.test(supplied)) return false;
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
  const parsed = JSON.parse(await readFile(target, "utf8")) as AcquisitionInboxRecord;
  if (parsed.version !== 1 || !parsed.batchId || !parsed.payloadHash) {
    throw new Error("持久化采集批次格式无效。");
  }
  return parsed;
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
  if (Buffer.byteLength(options.sharedSecret, "utf8") < 32) {
    throw new Error("统一采集共享密钥至少需要 32 字节。");
  }
  const clock = options.now ?? (() => new Date());
  const maxClockSkewMs = options.maxClockSkewMs ?? DEFAULT_CLOCK_SKEW_MS;
  const processingLeaseMs = options.processingLeaseMs ?? DEFAULT_PROCESSING_LEASE_MS;
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
      options.sharedSecret,
      signingInput(submission.timestamp, submission.batchId, bodyHash),
      submission.signature,
    )) {
      throw new AcquisitionReceiveError("采集签名无效。", "INVALID_SIGNATURE", 401);
    }
    const batch = parseBatch(submission.rawPayload, submission.batchId);
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
        registryRevision: batch.registryRevision,
        payloadHash: bodyHash,
        receivedAt,
        updatedAt: receivedAt,
        status: "pending",
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
      const eligible = available.filter(({ record }) => !excludedBatchIds.has(record.batchId));
      const candidate = eligible.find(({ record }) => record.status === "pending")
        ?? eligible.find(({ record }) => record.status === "failed")
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
        status: "succeeded",
        updatedAt: now,
        completedAt: now,
        lastError: undefined,
      });
    });
  }

  function fail(batchId: string, error: unknown) {
    return serialized(async () => {
      const target = persistedPath(options.inboxDirectory, batchId);
      const record = await readPersisted(target);
      if (record.status !== "processing") throw new Error(`批次 ${batchId} 当前不可标记失败。`);
      await replacePersisted(target, {
        ...record,
        status: "failed",
        updatedAt: clock().toISOString(),
        lastError: cleanError(error),
      });
    });
  }

  async function stats(): Promise<AcquisitionInboxStats> {
    const available = await records();
    return Object.fromEntries(
      (["pending", "processing", "succeeded", "failed"] as const)
        .map((status) => [status, available.filter(({ record }) => record.status === status).length]),
    ) as AcquisitionInboxStats;
  }

  return { receive, claimNext, complete, fail, stats };
}

let configuredReceiver: ReturnType<typeof createAcquisitionReceiver> | undefined;

export function configuredAcquisitionReceiver() {
  if (configuredReceiver) return configuredReceiver;
  const sharedSecret = process.env.VAULT2077_PIPELINE_SHARED_SECRET
    || (process.env.NODE_ENV === "production" ? "" : "vault2077-local-pipeline-secret!");
  const dataRoot = process.env.VAULT2077_DATA_DIR
    ? path.resolve(process.env.VAULT2077_DATA_DIR)
    : path.join(process.cwd(), "data");
  configuredReceiver = createAcquisitionReceiver({
    inboxDirectory: path.join(dataRoot, "acquisition-inbox"),
    sharedSecret,
  });
  return configuredReceiver;
}
