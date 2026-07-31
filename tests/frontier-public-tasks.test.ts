import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  dispatchFrontierObservationTasks,
  enqueueFrontierObservationTask,
} from "../lib/frontier-public-tasks.ts";
import { createPendingSubmission, getSubmission } from "../lib/frontier-store.ts";

test("expired Frontier verification tasks are retired with their pending submission", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-frontier-task-expiry-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const now = new Date("2099-01-02T00:00:00.000Z");
    const submission = await createPendingSubmission({
      owner: "Example",
      repo: "Missing",
      email: "owner@example.com",
      note: "A repository that remains unavailable",
      defaultBranch: "",
      challenge: "challenge-value",
      rulesAccepted: true,
      now,
    });
    await enqueueFrontierObservationTask({
      kind: "verify_submission",
      season: submission.season,
      submissionId: submission.id,
      owner: submission.owner,
      repo: submission.repo,
      expiresAt: submission.challengeExpiresAt,
      now,
    });

    assert.deepEqual(
      await dispatchFrontierObservationTasks(200, new Date(Date.parse(submission.challengeExpiresAt) + 1)),
      [],
    );
    assert.equal(await getSubmission(submission.id), null);
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("Frontier star observation tasks remain dispatchable without a challenge expiry", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-frontier-task-observation-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const now = new Date("2099-01-02T00:00:00.000Z");
    await enqueueFrontierObservationTask({
      kind: "observe_stars",
      season: "2099-Q1",
      submissionId: "verified-submission",
      owner: "Example",
      repo: "Observed",
      now,
    });
    const tasks = await dispatchFrontierObservationTasks(200, new Date("2100-01-01T00:00:00.000Z"));
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0]?.submissionId, "verified-submission");
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
