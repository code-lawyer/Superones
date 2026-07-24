import "server-only";

import { randomInt } from "node:crypto";
import { drawRandomPrizes, rankSubmissions, seasonForDate } from "./frontier-domain";
import {
  challengeMatches,
  getSeasonResult,
  getSubmission,
  listPublicPrizePool,
  listUnsettledSeasonCodes,
  listVerifiedSubmissions,
  recordStarSnapshots,
  saveSeasonSettlement,
  type StoredSubmission,
} from "./frontier-store";
import { inspectGitHubRepository, readGitHubChallengeFile, type GitHubRepository } from "./github";

export function repositoryEligibilityError(repository: GitHubRepository) {
  if (repository.isPrivate) return "边境计划只接受公开仓库。";
  if (repository.isFork) return "纯 Fork 仓库不能参加边境计划。";
  if (repository.isArchived) return "已归档仓库不能参加边境计划。";
  if (!repository.license || repository.license === "NOASSERTION") return "仓库需要先声明可识别的开源许可证。";
  return null;
}

function isMissingResource(error: unknown) {
  return error instanceof Error && error.message.includes("没有找到");
}

export async function refreshSeasonStars(season: string) {
  const submissions = await listVerifiedSubmissions(season);
  const results = await Promise.allSettled(submissions.map(async (submission) => {
    const repository = await inspectGitHubRepository(submission.owner, submission.repo);
    return { submissionId: submission.id, stars: repository.stars };
  }));
  const updates = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const capturedAt = new Date().toISOString();
  if (updates.length > 0) await recordStarSnapshots(season, updates, capturedAt);
  return { season, refreshed: updates.length, failed: results.length - updates.length, capturedAt };
}

async function settlementCandidate(submission: StoredSubmission) {
  let repository: GitHubRepository;
  try {
    repository = await inspectGitHubRepository(submission.owner, submission.repo);
  } catch (error) {
    if (isMissingResource(error)) return null;
    throw error;
  }
  if (repositoryEligibilityError(repository)) return null;

  const filePath = `.vault2077/season-${submission.season}.json`;
  let payload: { platform?: unknown; season?: unknown; repository?: unknown; challenge?: unknown };
  try {
    payload = JSON.parse(await readGitHubChallengeFile(submission.owner, submission.repo, submission.defaultBranch, filePath)) as typeof payload;
  } catch (error) {
    if (isMissingResource(error) || error instanceof SyntaxError) return null;
    throw error;
  }
  if (
    payload.platform !== "vault2077" ||
    payload.season !== submission.season ||
    payload.repository !== submission.repository ||
    typeof payload.challenge !== "string" ||
    !challengeMatches(payload.challenge, submission.challengeHash)
  ) return null;

  return {
    id: submission.id,
    repository: submission.repository,
    description: submission.note,
    baseline: submission.baselineStars ?? repository.stars,
    current: repository.stars,
    verifiedAt: submission.verifiedAt ?? submission.createdAt,
  };
}

export async function settleSeason(season: string, settledAt = new Date().toISOString()) {
  const existing = await getSeasonResult(season);
  if (existing) return existing;

  const submissions = await listVerifiedSubmissions(season);
  const candidates = [];
  const ineligibleSubmissionIds: string[] = [];
  for (const submission of submissions) {
    const candidate = await settlementCandidate(submission);
    if (candidate) candidates.push(candidate);
    else ineligibleSubmissionIds.push(submission.id);
  }

  if (candidates.length > 0) {
    await recordStarSnapshots(season, candidates.map((item) => ({ submissionId: item.id, stars: item.current })), settledAt);
  }
  const finalRankings = rankSubmissions(candidates);
  const prizes = (await listPublicPrizePool(season)).filter((item) => item.status === "available");
  const draw = drawRandomPrizes(finalRankings, prizes.map((item) => item.id), (upperExclusive) => randomInt(upperExclusive));

  return saveSeasonSettlement({
    season,
    settledAt,
    finalRankings,
    ineligibleSubmissionIds,
    assignments: draw.assignments,
    remainingPrizeDonationIds: draw.remainingPrizeDonationIds,
  });
}

export async function runFrontierTick(now: Date = new Date()) {
  const currentSeasonCode = seasonForDate(now).code;
  const refresh = await refreshSeasonStars(currentSeasonCode);
  const unsettled = await listUnsettledSeasonCodes(now);
  const settlements = [];
  for (const season of unsettled) settlements.push(await settleSeason(season, now.toISOString()));
  return { refresh, settlements };
}
