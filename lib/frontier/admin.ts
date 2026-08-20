import "server-only";

import { seasonFromCode } from "../frontier-domain.ts";
import { isValidFrontierReward } from "../frontier-launch-config.ts";
import { decryptSensitiveText } from "../sensitive-data.ts";
import { mutateFrontierStore, readFrontierStore } from "./internal-store.ts";
import type { AdminPrizeDonation, AdminSubmission, FrontierSeasonConfiguration } from "./model.ts";
import { createEmptyFrontierSeasonConfiguration } from "./season-configuration.ts";

export async function saveFrontierSeasonRewardDraft(season: string, officialReward: string, now = new Date()) {
  seasonFromCode(season);
  const reward = officialReward.trim();
  if (!isValidFrontierReward(reward)) {
    throw new Error("官方奖励需为 4–200 字的真实内容，不能包含待公布或占位表述。");
  }
  return mutateFrontierStore((store) => {
    const existing = store.seasonConfigurations.find((item) => item.season === season);
    const configuration: FrontierSeasonConfiguration = {
      ...(existing ?? createEmptyFrontierSeasonConfiguration(season)),
      officialReward: reward,
      status: "draft",
      updatedAt: now.toISOString(),
      publishedAt: null,
    };
    if (existing) Object.assign(existing, configuration);
    else store.seasonConfigurations.push(configuration);
    return configuration;
  });
}

export async function publishFrontierSeasonReward(season: string, now = new Date()) {
  seasonFromCode(season);
  return mutateFrontierStore((store) => {
    const configuration = store.seasonConfigurations.find((item) => item.season === season);
    if (!configuration || !isValidFrontierReward(configuration.officialReward)) {
      throw new Error("请先保存本赛季真实官方奖励草稿。");
    }
    configuration.status = "published";
    configuration.updatedAt = now.toISOString();
    configuration.publishedAt = now.toISOString();
    return configuration;
  });
}

export async function listAdminPrizeDonations(): Promise<AdminPrizeDonation[]> {
  const store = await readFrontierStore();
  return store.prizeDonations
    .map(({ emailEncrypted, ...item }) => ({ ...item, email: decryptSensitiveText(emailEncrypted) }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function setPrizeDonationStatus(id: string, action: "confirm" | "reject" | "withdraw") {
  return mutateFrontierStore((store) => {
    const donation = store.prizeDonations.find((item) => item.id === id);
    if (!donation) throw new Error("奖品捐献记录不存在。");
    if (action === "confirm") {
      if (donation.status !== "pending_confirmation") throw new Error("只有待确认奖品可以加入奖池。");
      donation.status = "available";
      donation.confirmedAt = new Date().toISOString();
    } else if (action === "reject") {
      if (donation.status !== "pending_confirmation") throw new Error("只有待确认奖品可以拒绝。");
      donation.status = "rejected";
    } else {
      if (donation.status !== "available" && donation.status !== "carried_over") {
        throw new Error("只有已确认且尚未分配的奖品可以撤回。");
      }
      donation.status = "withdrawn";
    }
    return donation;
  });
}

export async function listAdminSubmissions(): Promise<AdminSubmission[]> {
  const store = await readFrontierStore();
  return store.submissions
    .map(({ emailEncrypted, challengeHash: _challengeHash, ...submission }) => ({
      ...submission,
      email: decryptSensitiveText(emailEncrypted),
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export { getFrontierSeasonConfiguration, getFrontierSeasonLaunchState } from "./season.ts";
export type { AdminPrizeDonation, AdminSubmission, FrontierSeasonConfiguration } from "./model.ts";
