import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("Frontier settlement lease is recoverable and settlement is idempotent", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-frontier-store-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const {
      beginSeasonSettlement,
      failSeasonSettlement,
      getSeasonResult,
      saveSeasonSettlement,
    } = await import(`../lib/frontier-store.ts?settlement=${Date.now()}`);
    const season = "2099-Q1";
    const startedAt = new Date("2099-04-01T00:00:00.000Z");
    assert.equal(await beginSeasonSettlement(season, startedAt), "started");
    assert.equal(await beginSeasonSettlement(season, new Date(startedAt.getTime() + 1_000)), "busy");
    assert.equal(await failSeasonSettlement(season, new Error("temporary failure"), startedAt), true);
    assert.equal(await beginSeasonSettlement(season, new Date(startedAt.getTime() + 2_000)), "started");

    const result = await saveSeasonSettlement({
      season,
      settledAt: new Date(startedAt.getTime() + 3_000).toISOString(),
      finalRankings: [],
      ineligibleSubmissionIds: [],
      assignments: [],
      remainingPrizeDonationIds: [],
    });
    assert.equal(result.season, season);
    assert.equal(await beginSeasonSettlement(season, new Date(startedAt.getTime() + 4_000)), "settled");
    assert.equal((await getSeasonResult(season))?.settledAt, result.settledAt);
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("verified Frontier submissions are recoverable by repository identity", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-frontier-identity-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const {
      createPendingSubmission,
      findSeasonSubmission,
      markSubmissionVerified,
    } = await import(`../lib/frontier-store.ts?identity=${Date.now()}`);
    const now = new Date("2099-01-02T00:00:00.000Z");
    const submission = await createPendingSubmission({
      owner: "Example",
      repo: "Project",
      email: "owner@example.com",
      note: "A durable public project",
      defaultBranch: "main",
      challenge: "challenge-value",
      rulesAccepted: true,
      now,
    });
    await markSubmissionVerified(submission.id, 42, now);
    const recovered = await findSeasonSubmission("example", "project", submission.season);
    assert.equal(recovered?.id, submission.id);
    assert.equal(recovered?.status, "verified");
    assert.equal(recovered?.baselineStars, 42);
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
