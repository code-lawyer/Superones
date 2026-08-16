import "server-only";

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAcquisitionBatchProcessor } from "../lib/acquisition-processor.ts";
import {
  planSicPublicationRecovery,
  type SicRecoveryInboxRow,
} from "../lib/sic-recovery.ts";
import {
  getSicRecoveryProjection,
  replaceSicRecoveryProjection,
} from "../lib/sic-content-store.ts";
import { sicContentProjectionDigest } from "../lib/sic-content-identity.ts";
import {
  closePersistencePool,
  configuredPostgresPool,
} from "../lib/state-document-store.ts";
import type { SicContentItem, SicContentGroupId } from "../lib/sic-content-types.ts";

const apply = process.argv.includes("--apply");
const confirmation = process.argv.find((value) => value.startsWith("--confirm="))?.slice("--confirm=".length);
const fromRunId = process.argv.find((value) => value.startsWith("--from-run="))?.slice("--from-run=".length);
const minimumCountsArgument = process.argv.find((value) => value.startsWith("--minimum-counts="))?.slice("--minimum-counts=".length);
if (apply && confirmation !== "REBUILD_SIC_PUBLICATIONS") {
  throw new Error("写入恢复必须同时提供 --confirm=REBUILD_SIC_PUBLICATIONS。");
}

function groupCounts(items: SicContentItem[]) {
  const counts: Record<SicContentGroupId, number> = {
    papers: 0,
    documents: 0,
    courses: 0,
    podcasts: 0,
  };
  const seenSources = new Set<string>();
  for (const item of [...items].sort((left, right) => (
    Date.parse(right.publishedAt ?? right.collectedAt) - Date.parse(left.publishedAt ?? left.collectedAt)
  ))) {
    if (item.group !== "papers") {
      const identity = `${item.group}:${item.sourceId}`;
      if (seenSources.has(identity)) continue;
      seenSources.add(identity);
    }
    counts[item.group] += 1;
  }
  return counts;
}

function parseMinimumCounts(value: string | undefined) {
  if (!value) return null;
  const counts = groupCounts([]);
  const seen = new Set<SicContentGroupId>();
  for (const entry of value.split(",")) {
    const [group, rawCount] = entry.split("=");
    if (!(group in counts) || !/^\d+$/.test(rawCount ?? "")) {
      throw new Error("--minimum-counts 必须使用 papers=数字,documents=数字,courses=数字,podcasts=数字。");
    }
    counts[group as SicContentGroupId] = Number(rawCount);
    seen.add(group as SicContentGroupId);
  }
  if (seen.size !== 4) throw new Error("--minimum-counts 必须显式包含四个 SiC 内容组。");
  return counts;
}

const requiredMinimumCounts = parseMinimumCounts(minimumCountsArgument);
if (apply && !requiredMinimumCounts) {
  throw new Error("写入恢复必须根据备份证据提供四组 --minimum-counts。");
}

function restoreEnvironment(previous: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

const inbox = await configuredPostgresPool().query<{
  batch_id: string;
  payload_hash: string;
  raw_payload: string;
  status: string;
}>(
  `SELECT batch_id, payload_hash, raw_payload, status
     FROM vault2077_acquisition_inbox
    WHERE lane = 'sic' AND status = 'processed'
    ORDER BY received_at, batch_id`,
);
const rows: SicRecoveryInboxRow[] = inbox.rows.map((row) => ({
  batchId: row.batch_id,
  payloadHash: row.payload_hash,
  rawPayload: row.raw_payload,
  status: row.status,
}));
const plan = planSicPublicationRecovery(rows, { fromRunId });
const current = await getSicRecoveryProjection();
const before = groupCounts(current.items);

if (!apply) {
  console.log(JSON.stringify({
    mode: "dry-run",
    baselineRunId: plan.baselineRunId,
    validatedInboxBatchCount: plan.validatedInboxBatchCount,
    replayRunCount: plan.batches.length,
    currentPublishedCounts: before,
    projectedRawCounts: plan.projectedRawCounts,
    projectedSourceCount: plan.projectedSourceCount,
    nextStep: "Create a fresh production backup, record verified group minima, then rerun with --apply, --confirm and --minimum-counts.",
  }, null, 2));
  await closePersistencePool();
  process.exit(0);
}

const expectedCurrentDigest = sicContentProjectionDigest(current.items);
const recoverySeed = {
  ...current,
  updatedAt: null,
  reports: [],
  sourceSnapshots: {},
  bootstrap: { runId: null, completedSourceIds: [], lastBootstrapAt: null, lastRunMode: null },
};
const temporaryDataDirectory = await mkdtemp(path.join(os.tmpdir(), "vault2077-sic-recovery-"));
const previousEnvironment = Object.fromEntries([
  "VAULT2077_DATABASE_URL",
  "DATABASE_URL",
  "VAULT2077_DATA_DIR",
  "VAULT2077_ALLOW_FILE_PREVIEW",
].map((name) => [name, process.env[name]]));
let candidate;
try {
  await writeFile(
    path.join(temporaryDataDirectory, "sic-content-store.json"),
    `${JSON.stringify(recoverySeed, null, 2)}\n`,
    "utf8",
  );
  delete process.env.VAULT2077_DATABASE_URL;
  delete process.env.DATABASE_URL;
  process.env.VAULT2077_DATA_DIR = temporaryDataDirectory;
  process.env.VAULT2077_ALLOW_FILE_PREVIEW = "true";
  const processBatch = createAcquisitionBatchProcessor();
  for (const entry of plan.batches) {
    await processBatch(entry.batch, { payloadHash: entry.payloadHash, attempt: 1 });
  }
  candidate = await getSicRecoveryProjection();
} finally {
  restoreEnvironment(previousEnvironment);
  await rm(temporaryDataDirectory, { recursive: true, force: true });
}

const after = groupCounts(candidate.items);
for (const group of Object.keys(plan.projectedRawCounts) as SicContentGroupId[]) {
  if (plan.projectedRawCounts[group] > 0 && after[group] === 0) {
    throw new Error(`恢复候选的 ${group} 仍为空；拒绝写入生产。`);
  }
}
for (const group of Object.keys(requiredMinimumCounts!) as SicContentGroupId[]) {
  if (after[group] < requiredMinimumCounts![group]) {
    throw new Error(`恢复候选的 ${group}=${after[group]}，低于备份证据下限 ${requiredMinimumCounts![group]}；拒绝写入生产。`);
  }
}
const state = await replaceSicRecoveryProjection({
  projection: candidate,
  expectedCurrentDigest,
});
console.log(JSON.stringify({
  mode: "applied",
  baselineRunId: plan.baselineRunId,
  validatedInboxBatchCount: plan.validatedInboxBatchCount,
  replayRunCount: plan.batches.length,
  before,
  after,
  state,
}, null, 2));
await closePersistencePool();
