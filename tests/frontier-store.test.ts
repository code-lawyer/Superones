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
      officialReward: "季度冠军奖金人民币 10,000 元",
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

test("Frontier season reward is drafted and published through durable admin state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-frontier-season-"));
  const previousDataDir = process.env.VAULT2077_DATA_DIR;
  const previousMasterSwitch = process.env.VAULT2077_FRONTIER_WRITES_ENABLED;
  process.env.VAULT2077_DATA_DIR = root;
  process.env.VAULT2077_FRONTIER_WRITES_ENABLED = "true";
  try {
    const {
      getFrontierSeasonLaunchState,
      publishFrontierSeasonReward,
      saveFrontierSeasonRewardDraft,
    } = await import(`../lib/frontier-store.ts?season=${Date.now()}`);
    const season = "2099-Q2";
    assert.equal((await getFrontierSeasonLaunchState(season)).writesEnabled, false);
    const draft = await saveFrontierSeasonRewardDraft(season, "季度冠军奖金人民币 10,000 元");
    assert.equal(draft.status, "draft");
    assert.equal((await getFrontierSeasonLaunchState(season)).writesEnabled, false);
    const published = await publishFrontierSeasonReward(season);
    assert.equal(published.rewardProvider, "边境计划管理局");
    assert.equal(published.rewardProcessOpenWithinDays, 7);
    assert.match(published.taxNotice, /依法需代扣代缴/);
    assert.equal((await getFrontierSeasonLaunchState(season)).writesEnabled, true);
  } finally {
    if (previousDataDir === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previousDataDir;
    if (previousMasterSwitch === undefined) delete process.env.VAULT2077_FRONTIER_WRITES_ENABLED;
    else process.env.VAULT2077_FRONTIER_WRITES_ENABLED = previousMasterSwitch;
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
