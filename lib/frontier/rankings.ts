import "server-only";

import { rankSubmissions, seasonForDate } from "../frontier-domain.ts";
import type { FrontierEntry } from "../types.ts";
import { mutateFrontierStore, readFrontierStore } from "./internal-store.ts";

export function currentSeason(now: Date = new Date()) {
  return seasonForDate(now);
}

export async function recordStarSnapshots(
  season: string,
  updates: Array<{ submissionId: string; stars: number }>,
  capturedAt = new Date().toISOString(),
) {
  return mutateFrontierStore((store) => {
    for (const update of updates) {
      const submission = store.submissions.find((item) => (
        item.id === update.submissionId && item.season === season && item.status === "verified"
      ));
      if (!submission) continue;
      if (submission.lastSnapshotAt && Date.parse(capturedAt) < Date.parse(submission.lastSnapshotAt)) continue;
      submission.currentStars = update.stars;
      submission.lastSnapshotAt = capturedAt;
      const duplicate = store.snapshots.some((snapshot) => (
        snapshot.submissionId === submission.id && snapshot.capturedAt === capturedAt
      ));
      if (!duplicate) store.snapshots.push({ submissionId: submission.id, season, capturedAt, stars: update.stars });
    }
    store.snapshots = store.snapshots.slice(-20_000);
    return updates.length;
  });
}

export async function listVerifiedSubmissions(season = seasonForDate().code) {
  const store = await readFrontierStore();
  return store.submissions.filter((item) => item.season === season && item.status === "verified");
}

export async function listPublicRankings(season = seasonForDate().code): Promise<FrontierEntry[]> {
  const verified = await listVerifiedSubmissions(season);
  return rankSubmissions(verified.map((item) => ({
    id: item.id,
    repository: item.repository,
    description: item.note || "参赛项目",
    baseline: item.baselineStars ?? 0,
    current: item.currentStars ?? item.baselineStars ?? 0,
    verifiedAt: item.verifiedAt ?? item.createdAt,
  }))).map((item) => ({
    rank: item.rank,
    repo: item.repository,
    description: item.description,
    baseline: item.baseline,
    current: item.current,
    delta: item.delta,
    submitted: item.verifiedAt.slice(0, 10),
  }));
}

export async function latestRankingUpdate(season = seasonForDate().code) {
  const verified = await listVerifiedSubmissions(season);
  return verified
    .map((item) => item.lastSnapshotAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}
