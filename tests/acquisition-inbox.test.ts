import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AcquisitionReceiveError,
  createAcquisitionReceiver,
  type AcquisitionSubmission,
} from "../lib/acquisition-inbox.ts";
import { payloadHash, signingInput } from "../lib/acquisition-contract.ts";

const secret = "test-unified-acquisition-secret-32-bytes";
const now = new Date("2026-07-24T01:00:00.000Z");

function batch() {
  return {
    schemaVersion: 1,
    batchId: "batch:2026-07-24T010000Z:receiver",
    runId: "run:2026-07-24T010000Z:receiver",
    lane: "sic",
    runMode: "incremental",
    scheduleId: "schedule:test:sic",
    windowFrom: "2026-07-24T00:00:00.000Z",
    windowUntil: "2026-07-24T01:00:00.000Z",
    registryRevision: "sources:2026-07-24",
    collectedFrom: "2026-07-24T00:00:00.000Z",
    collectedUntil: "2026-07-24T01:00:00.000Z",
    collectedAt: "2026-07-24T01:00:00.000Z",
    records: [{
      schemaVersion: 1,
      kind: "publication",
      recordId: "paper:arxiv:2607.00001:v1",
      sourceId: "arxiv:cs-ai",
      externalId: "2607.00001v1",
      canonicalUrl: "https://arxiv.org/abs/2607.00001",
      observedAt: "2026-07-24T00:30:00.000Z",
      contentHash: "a".repeat(64),
      payload: { title: "A useful paper" },
    }],
    sourceReports: [{
      sourceId: "arxiv:cs-ai",
      adapter: "arxiv",
      status: "succeeded",
      startedAt: "2026-07-24T00:00:02.000Z",
      completedAt: "2026-07-24T00:00:04.000Z",
      recordCount: 1,
    }],
  };
}

function submission(value = batch()): AcquisitionSubmission {
  const rawPayload = JSON.stringify(value);
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const signature = `sha256=${createHmac("sha256", secret)
    .update(signingInput(timestamp, value.batchId, payloadHash(rawPayload)))
    .digest("base64url")}`;
  return { batchId: value.batchId, timestamp, signature, rawPayload };
}

function version2Batch() {
  const legacy = batch();
  return {
    ...legacy,
    schemaVersion: 2,
    sourceRegistry: {
      schemaVersion: 1,
      revision: legacy.registryRevision,
      lane: legacy.lane,
      sources: [{ sourceId: "arxiv:cs-ai", adapter: "official_api" }],
    },
    sourceReports: [{ ...legacy.sourceReports[0], adapter: "official_api" }],
  };
}

function keyringSubmission(keyId: string, signingSecret: string): AcquisitionSubmission {
  const value = batch();
  const rawPayload = JSON.stringify(value);
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const signature = `sha256=${createHmac("sha256", signingSecret)
    .update(signingInput(timestamp, value.batchId, payloadHash(rawPayload)))
    .digest("base64url")}`;
  return { batchId: value.batchId, keyId, timestamp, signature, rawPayload };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-acquisition-"));
  return {
    root,
    receiver: createAcquisitionReceiver({
      inboxDirectory: path.join(root, "inbox"),
      sharedSecret: secret,
      now: () => now,
      retryBaseMs: 0,
    }),
  };
}

test("accepts a signed batch and returns source and kind accounting", async (context) => {
  const { root, receiver } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const result = await receiver.receive(submission());
  assert.deepEqual(result, {
    accepted: true,
    duplicate: false,
    status: "received",
    batchId: batch().batchId,
    runId: batch().runId,
    lane: "sic",
    runMode: "incremental",
    scheduleId: "schedule:test:sic",
    windowFrom: "2026-07-24T00:00:00.000Z",
    windowUntil: "2026-07-24T01:00:00.000Z",
    recordCount: 1,
    sourceCount: 1,
    kinds: { publication: 1 },
  });
});

test("recognizes an identical batch after a receiver restart", async (context) => {
  const { root, receiver } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const input = submission();
  await receiver.receive(input);
  const restarted = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    sharedSecret: secret,
    now: () => now,
  });
  const duplicate = await restarted.receive(input);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.status, "received");
});

test("concurrent receiver instances cannot overwrite an accepted batch", async (context) => {
  const { root, receiver } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const otherReceiver = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    sharedSecret: secret,
    now: () => now,
  });
  const results = await Promise.all([
    receiver.receive(submission()),
    otherReceiver.receive(submission()),
  ]);
  assert.equal(results.filter((result) => result.duplicate).length, 1);
  assert.equal(results.filter((result) => !result.duplicate).length, 1);
});

test("rejects a different body that reuses a persisted batchId", async (context) => {
  const { root, receiver } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await receiver.receive(submission());
  const changed = batch();
  changed.records[0].payload.title = "Changed paper";
  await assert.rejects(
    receiver.receive(submission(changed)),
    (error) => error instanceof AcquisitionReceiveError
      && error.code === "BATCH_CONFLICT"
      && error.status === 409,
  );
});

test("rejects invalid signatures before persisting the batch", async (context) => {
  const { root, receiver } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const invalid = { ...submission(), signature: "sha256=invalid" };
  await assert.rejects(
    receiver.receive(invalid),
    (error) => error instanceof AcquisitionReceiveError && error.code === "INVALID_SIGNATURE",
  );
  const accepted = await receiver.receive(submission());
  assert.equal(accepted.duplicate, false);
});

test("accepts old and current signing keys during a controlled rotation", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-acquisition-keyring-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const previousSecret = "previous-signing-secret-that-is-long-enough";
  const currentSecret = "current-signing-secret-that-is-long-enough";
  const receiver = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    signingKeys: new Map([
      ["previous", previousSecret],
      ["current", currentSecret],
    ]),
    now: () => now,
  });
  assert.equal((await receiver.receive(keyringSubmission("previous", previousSecret))).status, "received");
  const changed = batch();
  changed.batchId = `${changed.batchId}:current`;
  const rawPayload = JSON.stringify(changed);
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const signature = `sha256=${createHmac("sha256", currentSecret)
    .update(signingInput(timestamp, changed.batchId, payloadHash(rawPayload)))
    .digest("base64url")}`;
  assert.equal((await receiver.receive({
    batchId: changed.batchId,
    keyId: "current",
    timestamp,
    signature,
    rawPayload,
  })).status, "received");
  await assert.rejects(
    receiver.receive(keyringSubmission("retired", previousSecret)),
    (error) => error instanceof AcquisitionReceiveError && error.code === "INVALID_SIGNATURE",
  );
});

test("rejects stale timestamps", async (context) => {
  const { root, receiver } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const input = submission();
  input.timestamp = String(Number(input.timestamp) - 301);
  await assert.rejects(
    receiver.receive(input),
    (error) => error instanceof AcquisitionReceiveError && error.code === "STALE_TIMESTAMP",
  );
});

test("rejects a source registry revision that is not deployed", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-acquisition-revision-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const receiver = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    sharedSecret: secret,
    now: () => now,
    allowedRegistryRevisions: new Set(["sources:deployed"]),
  });
  await assert.rejects(
    receiver.receive(submission()),
    (error) => error instanceof AcquisitionReceiveError
      && error.code === "UNKNOWN_REGISTRY_REVISION"
      && error.status === 409,
  );
  const deployed = batch();
  deployed.registryRevision = "sources:deployed";
  assert.equal((await receiver.receive(submission(deployed))).status, "received");
});

test("accepts a signed v2 source snapshot without deploying its exact revision", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-acquisition-dynamic-registry-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const receiver = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    sharedSecret: secret,
    now: () => now,
    allowedRegistryRevisions: new Set(["sources:older-domestic-bundle"]),
  });
  const result = await receiver.receive(submission(version2Batch()));
  assert.equal(result.status, "received");
});

test("accepts the deployed trusted feed adapter in a signed v2 source snapshot", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-acquisition-trusted-feed-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const receiver = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    sharedSecret: secret,
    now: () => now,
  });
  const value = version2Batch();
  value.sourceRegistry.sources[0].adapter = "trusted_feed_json";
  value.sourceReports[0].adapter = "trusted_feed_json";

  assert.equal((await receiver.receive(submission(value))).status, "received");
});

test("rejects a v2 source snapshot that requires an undeployed adapter", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-acquisition-adapter-gate-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const receiver = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    sharedSecret: secret,
    now: () => now,
  });
  const value = version2Batch();
  value.sourceRegistry.sources[0].adapter = "future-connector";
  value.sourceReports[0].adapter = "future-connector";
  await assert.rejects(
    receiver.receive(submission(value)),
    (error) => error instanceof AcquisitionReceiveError
      && error.code === "UNSUPPORTED_SOURCE_ADAPTER"
      && error.status === 409,
  );
});

test("claims, fails, retries, and completes a durable batch", async (context) => {
  const { root, receiver } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await receiver.receive(submission());

  const first = await receiver.claimNext();
  assert.equal(first?.batch.batchId, batch().batchId);
  assert.equal(first?.attempt, 1);
  assert.deepEqual(await receiver.stats(), {
    received: 0,
    processing: 1,
    processed: 0,
    retryable: 0,
    quarantined: 0,
  });

  assert.equal(
    await receiver.fail(batch().batchId, first!.claimToken, new Error("temporary model failure")),
    "retryable",
  );
  const retry = await receiver.claimNext();
  assert.equal(retry?.attempt, 2);
  await receiver.complete(batch().batchId, retry!.claimToken);
  assert.equal(await receiver.claimNext(), null);
  assert.deepEqual(await receiver.stats(), {
    received: 0,
    processing: 0,
    processed: 1,
    retryable: 0,
    quarantined: 0,
  });
});

test("claim inclusion filters isolate a maintenance consumer from unrelated batches", async (context) => {
  const { root, receiver } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const first = batch();
  const second = batch();
  second.batchId = `${first.batchId}:isolated`;
  second.runId = `${first.runId}:isolated`;
  await receiver.receive(submission(first));
  await receiver.receive(submission(second));

  const claimed = await receiver.claimNext(new Set(), new Set([second.batchId]));
  assert.equal(claimed?.batch.batchId, second.batchId);
  assert.equal((await receiver.stats()).received, 1);
});

test("quarantines a batch after the retry budget is exhausted", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-acquisition-budget-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const receiver = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    sharedSecret: secret,
    now: () => now,
    maxAttempts: 2,
    retryBaseMs: 0,
  });
  await receiver.receive(submission());
  const first = await receiver.claimNext();
  assert.equal(first?.attempt, 1);
  assert.equal(await receiver.fail(batch().batchId, first!.claimToken, new Error("temporary")), "retryable");
  const second = await receiver.claimNext();
  assert.equal(second?.attempt, 2);
  assert.equal(await receiver.fail(batch().batchId, second!.claimToken, new Error("still failing")), "quarantined");
  assert.equal(await receiver.claimNext(), null);
  assert.deepEqual(await receiver.stats(), {
    received: 0,
    processing: 0,
    processed: 0,
    retryable: 0,
    quarantined: 1,
  });
});

test("allows a deterministic failure to enter quarantine immediately", async (context) => {
  const { root, receiver } = await fixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  await receiver.receive(submission());
  const claimed = await receiver.claimNext();
  assert.equal(
    await receiver.fail(batch().batchId, claimed!.claimToken, new Error("unsupported schema"), "quarantined"),
    "quarantined",
  );
  assert.equal(await receiver.claimNext(), null);
});

test("recovers an expired processing lease after restart", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-acquisition-lease-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  let current = new Date("2026-07-24T01:00:00.000Z");
  const firstReceiver = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    sharedSecret: secret,
    now: () => current,
    processingLeaseMs: 60_000,
  });
  await firstReceiver.receive(submission());
  assert.equal((await firstReceiver.claimNext())?.attempt, 1);

  current = new Date("2026-07-24T01:01:01.000Z");
  const restarted = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    sharedSecret: secret,
    now: () => current,
    processingLeaseMs: 60_000,
  });
  assert.equal((await restarted.claimNext())?.attempt, 2);
});

test("an expired worker cannot complete a batch after a newer lease is claimed", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-acquisition-fencing-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  let current = new Date(now);
  const receiver = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    sharedSecret: secret,
    now: () => current,
    processingLeaseMs: 60_000,
  });
  await receiver.receive(submission());
  const expired = await receiver.claimNext();
  current = new Date(current.getTime() + 60_001);
  const active = await receiver.claimNext();
  assert.notEqual(active?.claimToken, expired?.claimToken);
  await assert.rejects(
    receiver.complete(batch().batchId, expired!.claimToken),
  );
  await receiver.complete(batch().batchId, active!.claimToken);
  assert.equal((await receiver.stats()).processed, 1);
});

test("retry backoff prevents a failed batch from being reclaimed immediately", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-acquisition-backoff-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  let current = new Date(now);
  const receiver = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    sharedSecret: secret,
    now: () => current,
    retryBaseMs: 5 * 60 * 1_000,
  });
  await receiver.receive(submission());
  const first = await receiver.claimNext();
  await receiver.fail(batch().batchId, first!.claimToken, new Error("temporary"));
  assert.equal(await receiver.claimNext(), null);
  current = new Date(current.getTime() + 5 * 60 * 1_000);
  assert.equal((await receiver.claimNext())?.attempt, 2);
});

test("inbox retention prunes terminal records without touching active work", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "vault2077-acquisition-retention-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  let current = new Date(now);
  const receiver = createAcquisitionReceiver({
    inboxDirectory: path.join(root, "inbox"),
    sharedSecret: secret,
    now: () => current,
  });
  await receiver.receive(submission());
  const claimed = await receiver.claimNext();
  await receiver.complete(batch().batchId, claimed!.claimToken);
  current = new Date(current.getTime() + 1_001);
  assert.equal(await receiver.prune({ processedMs: 1_000, quarantinedMs: 1_000 }), 1);
  assert.deepEqual(await receiver.stats(), {
    received: 0,
    processing: 0,
    processed: 0,
    retryable: 0,
    quarantined: 0,
  });
});
