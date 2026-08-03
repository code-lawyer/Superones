import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import {
  createPostgresAcquisitionReceiver,
  type AcquisitionSubmission,
} from "../lib/acquisition-inbox.ts";
import {
  payloadHash,
  signingInput,
  type AcquisitionBatch,
} from "../lib/acquisition-contract.ts";
import { withinDurableRateLimit } from "../lib/rate-limit.ts";
import {
  closePersistencePool,
  configuredPostgresPool,
  mutateStateDocument,
  readStateDocument,
  type StateDocumentDefinition,
} from "../lib/state-document-store.ts";
import {
  createAdminSession,
  readAdminSession,
  revokeAdminSession,
} from "../lib/admin-session-store.ts";

if (!process.env.VAULT2077_DATABASE_URL && !process.env.DATABASE_URL) {
  throw new Error("PostgreSQL 集成测试需要 VAULT2077_DATABASE_URL。");
}

const testId = randomUUID();
const namespace = `integration:${testId}`;
const rateLimitKey = `integration:${testId}`;
const secret = "vault2077-postgres-integration-secret-value";
const revision = "registry:postgres-integration";
const batchIds = [`batch:${testId}:1`, `batch:${testId}:2`];
const testBatchIds = new Set(batchIds);
const pool = configuredPostgresPool();
let adminSessionId: string | null = null;

const counterDocument: StateDocumentDefinition<{ version: 1; count: number }> = {
  namespace,
  fileName: "unused-in-postgres.json",
  create: () => ({ version: 1, count: 0 }),
  parse: (value) => {
    const parsed = value as { version?: unknown; count?: unknown };
    if (parsed.version !== 1 || typeof parsed.count !== "number") throw new Error("integration counter invalid");
    return parsed as { version: 1; count: number };
  },
};

function batch(batchId: string): AcquisitionBatch {
  const collectedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    batchId,
    runId: `run:${testId}`,
    lane: "rankings",
    runMode: "incremental",
    scheduleId: `integration:${testId}`,
    windowFrom: new Date(Date.now() - 60_000).toISOString(),
    windowUntil: collectedAt,
    registryRevision: revision,
    collectedFrom: new Date(Date.now() - 60_000).toISOString(),
    collectedUntil: collectedAt,
    collectedAt,
    records: [],
    sourceReports: [{
      sourceId: `integration-source-${batchId.at(-1)}`,
      adapter: "integration",
      status: "empty",
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      completedAt: collectedAt,
      recordCount: 0,
    }],
  };
}

function submission(value: AcquisitionBatch): AcquisitionSubmission {
  const rawPayload = JSON.stringify(value);
  const timestamp = String(Math.floor(Date.now() / 1_000));
  const hash = payloadHash(rawPayload);
  return {
    batchId: value.batchId,
    timestamp,
    rawPayload,
    signature: `sha256=${createHmac("sha256", secret)
      .update(signingInput(timestamp, value.batchId, hash))
      .digest("base64url")}`,
  };
}

try {
  await Promise.all(Array.from({ length: 20 }, () => (
    mutateStateDocument(counterDocument, (value) => {
      value.count += 1;
    })
  )));
  assert.equal((await readStateDocument(counterDocument)).count, 20, "state-document row lock lost an update");

  const receiverOne = createPostgresAcquisitionReceiver({
    sharedSecret: secret,
    allowedRegistryRevisions: new Set([revision]),
    maxAttempts: 2,
    retryBaseMs: 0,
  });
  const receiverTwo = createPostgresAcquisitionReceiver({
    sharedSecret: secret,
    allowedRegistryRevisions: new Set([revision]),
    maxAttempts: 2,
    retryBaseMs: 0,
  });
  const submissions = batchIds.map((batchId) => submission(batch(batchId)));
  const receipts = await Promise.all(submissions.map((value) => receiverOne.receive(value)));
  assert.ok(receipts.every((value) => !value.duplicate));
  assert.equal((await receiverTwo.receive(submissions[0])).duplicate, true);

  const [first, second] = await Promise.all([
    receiverOne.claimNext(new Set(), testBatchIds),
    receiverTwo.claimNext(new Set(), testBatchIds),
  ]);
  assert.ok(first && second);
  assert.notEqual(first.batch.batchId, second.batch.batchId, "SKIP LOCKED returned one batch twice");
  await receiverOne.complete(first.batch.batchId, first.claimToken);
  assert.equal(await receiverTwo.fail(second.batch.batchId, second.claimToken, new Error("retry me")), "retryable");
  const retry = await receiverOne.claimNext(new Set(), testBatchIds);
  assert.equal(retry?.batch.batchId, second.batch.batchId);
  assert.equal(retry?.attempt, 2);
  assert.equal(await receiverOne.fail(second.batch.batchId, retry!.claimToken, new Error("exhausted")), "quarantined");
  const testQueue = await pool.query<{ status: string; count: string }>(
    `SELECT status, count(*)::text AS count
       FROM vault2077_acquisition_inbox
      WHERE batch_id = ANY($1::text[])
      GROUP BY status`,
    [batchIds],
  );
  const testQueueCounts = Object.fromEntries(
    testQueue.rows.map((row) => [row.status, Number(row.count)]),
  );
  assert.equal(testQueueCounts.processed, 1);
  assert.equal(testQueueCounts.quarantined, 1);

  assert.equal(await withinDurableRateLimit(rateLimitKey, 2, 60_000), true);
  assert.equal(await withinDurableRateLimit(rateLimitKey, 2, 60_000), true);
  assert.equal(await withinDurableRateLimit(rateLimitKey, 2, 60_000), false);

  const audit = await pool.query<{ id: string }>(
    `INSERT INTO vault2077_audit_log
       (actor_hash, action, target_type, target_id, result)
     VALUES ('integration', 'integration.test', 'database', $1, 'success')
     RETURNING id::text`,
    [testId],
  );
  await assert.rejects(
    pool.query("UPDATE vault2077_audit_log SET reason = 'mutated' WHERE id = $1", [audit.rows[0].id]),
    /append-only/,
  );

  const adminSession = await createAdminSession({
    subject: `integration-admin:${testId}`,
    email: "integration-admin@vault2077.invalid",
    role: "owner",
    authenticatedAt: new Date().toISOString(),
  });
  adminSessionId = adminSession.session.id;
  assert.equal((await readAdminSession(adminSession.token))?.id, adminSessionId);
  assert.equal(await revokeAdminSession(adminSession.token), true);
  assert.equal(await readAdminSession(adminSession.token), null);

  console.log(JSON.stringify({
    ok: true,
    stateDocumentCount: 20,
    claimedDistinctBatches: 2,
    finalQueue: testQueueCounts,
    durableRateLimit: "enforced",
    immutableAudit: "enforced",
    revocableAdminSession: "enforced",
  }));
} finally {
  await pool.query("DELETE FROM vault2077_acquisition_inbox WHERE batch_id = ANY($1::text[])", [batchIds]).catch(() => undefined);
  await pool.query("DELETE FROM vault2077_state_documents WHERE namespace = $1", [namespace]).catch(() => undefined);
  await pool.query("DELETE FROM vault2077_rate_limits WHERE key = $1", [rateLimitKey]).catch(() => undefined);
  if (adminSessionId) {
    await pool.query("DELETE FROM vault2077_admin_sessions WHERE id = $1", [adminSessionId]).catch(() => undefined);
  }
  await closePersistencePool();
}
