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

test("asynchronous Frontier verification rejects expired challenges and closed seasons", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-frontier-async-guard-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const {
      applyFrontierVerificationObservation,
      createPendingSubmission,
      getSubmission,
    } = await import(`../lib/frontier-store.ts?async-guard=${Date.now()}`);
    const { seasonFromCode } = await import("../lib/frontier-domain.ts");

    const createdAt = new Date("2099-01-02T00:00:00.000Z");
    const expired = await createPendingSubmission({
      owner: "Example",
      repo: "Expired",
      email: "owner@example.com",
      note: "An expired asynchronous verification",
      defaultBranch: "main",
      challenge: "expired-challenge",
      rulesAccepted: true,
      now: createdAt,
    });
    assert.equal(await applyFrontierVerificationObservation({
      submissionId: expired.id,
      season: expired.season,
      defaultBranch: "main",
      stars: 10,
      challenge: "expired-challenge",
      capturedAt: new Date(createdAt.getTime() + 60_000).toISOString(),
      now: new Date(Date.parse(expired.challengeExpiresAt) + 1),
    }), "challenge-expired");
    assert.equal(await getSubmission(expired.id), null);

    const seasonEnd = new Date(seasonFromCode("2099-Q1").endsAt);
    const closing = await createPendingSubmission({
      owner: "Example",
      repo: "Closing",
      email: "owner@example.com",
      note: "A verification delivered after season close",
      defaultBranch: "main",
      challenge: "closing-challenge",
      rulesAccepted: true,
      now: new Date(seasonEnd.getTime() - 60 * 60 * 1000),
    });
    assert.equal(await applyFrontierVerificationObservation({
      submissionId: closing.id,
      season: closing.season,
      defaultBranch: "main",
      stars: 20,
      challenge: "closing-challenge",
      capturedAt: new Date(seasonEnd.getTime() - 30 * 60 * 1000).toISOString(),
      now: new Date(seasonEnd.getTime() + 1),
    }), "season-closed");
    assert.equal(await getSubmission(closing.id), null);
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("asynchronous eligibility rejection keeps the exact reason and permits a corrected re-submission", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-frontier-rejection-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const {
      createPendingSubmission,
      findSeasonSubmission,
      getSubmission,
      rejectPendingSubmission,
    } = await import(`../lib/frontier-store.ts?rejection=${Date.now()}`);
    const now = new Date("2099-01-02T00:00:00.000Z");
    const first = await createPendingSubmission({
      owner: "Example",
      repo: "Correctable",
      email: "owner@example.com",
      note: "A correctable asynchronous verification",
      defaultBranch: "main",
      challenge: "first-challenge",
      rulesAccepted: true,
      now,
    });
    const reason = "仓库需要先声明可识别的开源许可证。";
    const rejected = await rejectPendingSubmission(first.id, reason);
    assert.equal(rejected?.status, "rejected");
    assert.equal(rejected?.verificationError, reason);
    assert.equal((await getSubmission(first.id))?.verificationError, reason);

    const second = await createPendingSubmission({
      owner: "Example",
      repo: "Correctable",
      email: "owner@example.com",
      note: "A corrected asynchronous verification",
      defaultBranch: "main",
      challenge: "second-challenge",
      rulesAccepted: true,
      now: new Date(now.getTime() + 60_000),
    });
    assert.equal(await getSubmission(first.id), null);
    assert.equal((await findSeasonSubmission("example", "correctable", second.season))?.id, second.id);
    assert.equal(second.status, "pending");
    assert.equal(second.verificationError, null);
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("verified Frontier submissions reject duplicates with a typed public conflict", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-frontier-conflict-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const {
      createPendingSubmission,
      FrontierSubmissionConflictError,
      markSubmissionVerified,
    } = await import(`../lib/frontier-store.ts?conflict=${Date.now()}`);
    const now = new Date("2099-01-02T00:00:00.000Z");
    const input = {
      owner: "Example",
      repo: "AlreadyVerified",
      email: "owner@example.com",
      note: "A verified repository",
      defaultBranch: "main",
      challenge: "verified-challenge",
      rulesAccepted: true,
      now,
    };
    const first = await createPendingSubmission(input);
    await markSubmissionVerified(first.id, 10, now);

    await assert.rejects(
      () => createPendingSubmission({ ...input, challenge: "duplicate-challenge" }),
      (error: unknown) => error instanceof FrontierSubmissionConflictError
        && (error as { code?: unknown }).code === "ALREADY_VERIFIED",
    );
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("unassigned confirmed prizes are explicitly carried into the next season", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-frontier-carryover-"));
  const previous = process.env.VAULT2077_DATA_DIR;
  process.env.VAULT2077_DATA_DIR = root;
  try {
    const {
      createPrizeDonation,
      listAdminPrizeDonations,
      listPublicPrizePool,
      saveSeasonSettlement,
      setPrizeDonationStatus,
    } = await import(`../lib/frontier-store.ts?carryover=${Date.now()}`);
    const donation = await createPrizeDonation({
      name: "Hardware prize",
      description: "A confirmed prize for the winner",
      email: "donor@example.com",
      noticeAccepted: true,
      now: new Date("2099-01-15T00:00:00.000Z"),
    });
    await setPrizeDonationStatus(donation.id, "confirm");
    await saveSeasonSettlement({
      season: "2099-Q1",
      settledAt: "2099-04-01T00:00:00.000Z",
      officialReward: "季度冠军奖金人民币 10,000 元",
      finalRankings: [],
      ineligibleSubmissionIds: [],
      assignments: [],
      remainingPrizeDonationIds: [donation.id],
    });
    const stored = (await listAdminPrizeDonations()).find((item: { id: string }) => item.id === donation.id);
    assert.equal(stored?.status, "carried_over");
    assert.equal(stored?.season, "2099-Q2");
    assert.equal((await listPublicPrizePool("2099-Q2"))[0]?.status, "carried_over");
  } finally {
    if (previous === undefined) delete process.env.VAULT2077_DATA_DIR;
    else process.env.VAULT2077_DATA_DIR = previous;
    await rm(root, { recursive: true, force: true });
  }
});
