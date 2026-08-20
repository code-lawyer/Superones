import "server-only";

import {
  nextSeason,
  seasonForDate,
  seasonFromCode,
  type PrizeDrawAssignment,
  type RankedSubmission,
} from "../frontier-domain.ts";
import { frontierMasterWritesEnabled, isValidFrontierReward } from "../frontier-launch-config.ts";
import { mutateFrontierStore, readFrontierStore } from "./internal-store.ts";
import type { SeasonResult } from "./model.ts";
import { createEmptyFrontierSeasonConfiguration } from "./season-configuration.ts";

export async function getFrontierSeasonConfiguration(season = seasonForDate().code) {
  const store = await readFrontierStore();
  return store.seasonConfigurations.find((item) => item.season === season)
    ?? createEmptyFrontierSeasonConfiguration(season);
}

export async function getFrontierSeasonLaunchState(season = seasonForDate().code) {
  const configuration = await getFrontierSeasonConfiguration(season);
  const published = configuration.status === "published" && isValidFrontierReward(configuration.officialReward);
  return { configuration, writesEnabled: frontierMasterWritesEnabled() && published };
}

export async function listUnsettledSeasonCodes(now: Date = new Date()) {
  const store = await readFrontierStore();
  const settled = new Set(store.seasonResults.map((item) => item.season));
  const candidates = new Set<string>();
  for (const item of [...store.submissions, ...store.prizeDonations]) candidates.add(item.season);
  return [...candidates]
    .filter((code) => !settled.has(code) && new Date(seasonFromCode(code).endsAt).getTime() <= now.getTime())
    .sort();
}

export async function beginSeasonSettlement(season: string, now = new Date()) {
  return mutateFrontierStore((store) => {
    if (store.seasonResults.some((item) => item.season === season)) return "settled" as const;
    const timestamp = now.toISOString();
    const existing = store.settlementRuns.find((item) => item.season === season);
    if (existing?.status === "settling" && Date.parse(existing.updatedAt) > now.getTime() - 30 * 60 * 1000) {
      return "busy" as const;
    }
    if (existing) {
      existing.status = "settling";
      existing.attempt += 1;
      existing.startedAt = timestamp;
      existing.updatedAt = timestamp;
      existing.completedAt = null;
      existing.lastError = null;
    } else {
      store.settlementRuns.push({
        season,
        status: "settling",
        attempt: 1,
        startedAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
        lastError: null,
      });
    }
    return "started" as const;
  });
}

export async function failSeasonSettlement(season: string, error: unknown, now = new Date()) {
  return mutateFrontierStore((store) => {
    const run = store.settlementRuns.find((item) => item.season === season);
    if (!run || run.status !== "settling") return false;
    run.status = "failed";
    run.updatedAt = now.toISOString();
    run.completedAt = now.toISOString();
    run.lastError = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").trim().slice(0, 500);
    return true;
  });
}

export async function saveSeasonSettlement(input: {
  season: string;
  settledAt: string;
  officialReward?: string;
  finalRankings: RankedSubmission[];
  ineligibleSubmissionIds: string[];
  assignments: PrizeDrawAssignment[];
  remainingPrizeDonationIds: string[];
}) {
  return mutateFrontierStore((store) => {
    const existing = store.seasonResults.find((item) => item.season === input.season);
    if (existing) {
      const run = store.settlementRuns.find((item) => item.season === input.season);
      if (run) {
        run.status = "settled";
        run.updatedAt = existing.settledAt;
        run.completedAt = existing.settledAt;
        run.lastError = null;
      }
      return existing;
    }
    const assignedAt = input.settledAt;
    const configuredReward = store.seasonConfigurations.find(
      (item) => item.season === input.season && item.status === "published",
    )?.officialReward;
    const officialReward = input.officialReward ?? configuredReward;
    if (!officialReward || !isValidFrontierReward(officialReward)) {
      throw new Error("本赛季没有已发布的真实官方奖励，不能执行结算。");
    }
    const result: SeasonResult = {
      season: input.season,
      settledAt: input.settledAt,
      officialReward,
      championSubmissionId: input.finalRankings[0]?.id ?? null,
      finalRankings: input.finalRankings,
      ineligibleSubmissionIds: input.ineligibleSubmissionIds,
      assignments: input.assignments.map((item) => ({ ...item, assignedAt })),
    };
    store.seasonResults.push(result);
    const run = store.settlementRuns.find((item) => item.season === input.season);
    if (run) {
      run.status = "settled";
      run.updatedAt = input.settledAt;
      run.completedAt = input.settledAt;
      run.lastError = null;
    } else {
      store.settlementRuns.push({
        season: input.season,
        status: "settled",
        attempt: 1,
        startedAt: input.settledAt,
        updatedAt: input.settledAt,
        completedAt: input.settledAt,
        lastError: null,
      });
    }

    for (const submission of store.submissions.filter((item) => item.season === input.season)) {
      if (input.ineligibleSubmissionIds.includes(submission.id)) {
        submission.status = "ineligible_at_settlement";
        submission.settlementReason = "结算时未通过机器资格或挑战文件复查。";
      } else if (input.finalRankings.some((item) => item.id === submission.id)) {
        submission.status = "settled";
      }
    }
    const champion = store.submissions.find((item) => item.id === result.championSubmissionId);
    if (champion && !store.championRepositories.includes(champion.repository.toLowerCase())) {
      store.championRepositories.push(champion.repository.toLowerCase());
    }
    const assignedIds = new Set(input.assignments.map((item) => item.prizeDonationId));
    const next = nextSeason(input.season);
    for (const donation of store.prizeDonations.filter((item) => item.season === input.season)) {
      if (assignedIds.has(donation.id)) donation.status = "assigned";
      else if (
        input.remainingPrizeDonationIds.includes(donation.id)
        && (donation.status === "available" || donation.status === "carried_over")
      ) {
        donation.status = "carried_over";
        donation.season = next.code;
      } else if (donation.status === "pending_confirmation") donation.season = next.code;
    }
    return result;
  });
}

export async function listSeasonHistory(): Promise<Array<SeasonResult & {
  championRepository: string | null;
  prizeAssignments: Array<{ repository: string; prizeName: string }>;
}>> {
  const store = await readFrontierStore();
  return store.seasonResults
    .map((result) => ({
      ...result,
      championRepository: store.submissions.find((item) => item.id === result.championSubmissionId)?.repository ?? null,
      prizeAssignments: result.assignments.map((assignment) => ({
        repository: store.submissions.find((item) => item.id === assignment.submissionId)?.repository ?? "未知仓库",
        prizeName: store.prizeDonations.find((item) => item.id === assignment.prizeDonationId)?.name ?? "未知奖品",
      })),
    }))
    .sort((left, right) => right.season.localeCompare(left.season));
}

export async function getSeasonResult(season: string) {
  const store = await readFrontierStore();
  return store.seasonResults.find((item) => item.season === season) ?? null;
}

export type { FrontierSeasonConfiguration, SeasonResult, SettlementRun } from "./model.ts";
