import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type InboundBatchStatus = "pending" | "processing" | "succeeded" | "failed";

export type PersistedBatch = {
  version: 2;
  batchId: string;
  payloadHash: string;
  receivedAt: string;
  updatedAt: string;
  status: InboundBatchStatus;
  attempts: number;
  processingStartedAt?: string;
  completedAt?: string;
  lastError?: string;
  rawPayload: string;
};

type LegacyPersistedBatch = {
  version: 1;
  batchId: string;
  payloadHash: string;
  receivedAt: string;
  rawPayload: string;
};

export class PersistedBatchConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistedBatchConflictError";
  }
}

const dataRoot = process.env.VAULT2077_DATA_DIR
  ? path.resolve(process.env.VAULT2077_DATA_DIR)
  : path.join(process.cwd(), "data");
const batchDirectory = path.join(dataRoot, "inbound-batches");
const processingLeaseMs = 15 * 60 * 1000;
let queueChain: Promise<unknown> = Promise.resolve();

function filePath(batchId: string) {
  return path.join(batchDirectory, `${createHash("sha256").update(batchId).digest("hex")}.json`);
}

function cleanError(value: unknown) {
  return (value instanceof Error ? value.message : String(value)).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

function migrate(record: PersistedBatch | LegacyPersistedBatch): PersistedBatch {
  if (record.version === 2) return record;
  return {
    ...record,
    version: 2,
    updatedAt: record.receivedAt,
    status: "pending",
    attempts: 0,
  };
}

async function readRecord(target: string) {
  return migrate(JSON.parse(await readFile(target, "utf8")) as PersistedBatch | LegacyPersistedBatch);
}

async function writeRecord(target: string, record: PersistedBatch) {
  await mkdir(batchDirectory, { recursive: true });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "wx" });
  await rename(temporary, target);
}

function serialized<T>(operation: () => Promise<T>) {
  const next = queueChain.then(operation, operation);
  queueChain = next.then(() => undefined, () => undefined);
  return next;
}

export function persistInboundBatch(batchId: string, payloadHash: string, rawPayload: string) {
  return serialized(async () => {
    await mkdir(batchDirectory, { recursive: true });
    const target = filePath(batchId);
    const now = new Date().toISOString();
    const record: PersistedBatch = {
      version: 2,
      batchId,
      payloadHash,
      receivedAt: now,
      updatedAt: now,
      status: "pending",
      attempts: 0,
      rawPayload,
    };
    try {
      await writeFile(target, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "wx" });
      return { duplicate: false, status: record.status };
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
      const existing = await readRecord(target);
      if (existing.batchId !== batchId || existing.payloadHash !== payloadHash) {
        throw new PersistedBatchConflictError("同一 batchId 已持久化不同正文。");
      }
      return { duplicate: true, status: existing.status };
    }
  });
}

export function claimNextInboundBatch(now = new Date()) {
  return serialized(async (): Promise<PersistedBatch | null> => {
    await mkdir(batchDirectory, { recursive: true });
    const records = await Promise.all((await readdir(batchDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => ({ target: path.join(batchDirectory, entry.name), record: await readRecord(path.join(batchDirectory, entry.name)) })));
    records.sort((left, right) => Date.parse(left.record.receivedAt) - Date.parse(right.record.receivedAt));
    // Fresh batches take precedence so one repeatedly failing historical batch
    // cannot starve the entire queue. Failed work is retried after all pending
    // work; expired processing leases are recovered last.
    const candidate = records.find(({ record }) => record.status === "pending")
      ?? records.find(({ record }) => record.status === "failed")
      ?? records.find(({ record }) => record.status === "processing"
        && Date.parse(record.processingStartedAt ?? record.updatedAt) < now.getTime() - processingLeaseMs);
    if (!candidate) return null;
    const claimed: PersistedBatch = {
      ...candidate.record,
      status: "processing",
      attempts: candidate.record.attempts + 1,
      processingStartedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastError: undefined,
    };
    await writeRecord(candidate.target, claimed);
    return claimed;
  });
}

export function completeInboundBatch(batchId: string) {
  return serialized(async () => {
    const target = filePath(batchId);
    const record = await readRecord(target);
    const now = new Date().toISOString();
    await writeRecord(target, { ...record, status: "succeeded", updatedAt: now, completedAt: now, lastError: undefined });
  });
}

export function failInboundBatch(batchId: string, error: unknown) {
  return serialized(async () => {
    const target = filePath(batchId);
    const record = await readRecord(target);
    await writeRecord(target, { ...record, status: "failed", updatedAt: new Date().toISOString(), lastError: cleanError(error) });
  });
}

export async function inboundBatchStats() {
  await mkdir(batchDirectory, { recursive: true });
  const records = await Promise.all((await readdir(batchDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readRecord(path.join(batchDirectory, entry.name))));
  return Object.fromEntries((["pending", "processing", "succeeded", "failed"] as const)
    .map((status) => [status, records.filter((record) => record.status === status).length]));
}
