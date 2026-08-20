import type { FrontierSeasonConfiguration } from "./model.ts";

export function createEmptyFrontierSeasonConfiguration(season: string): FrontierSeasonConfiguration {
  return {
    season,
    officialReward: "",
    rewardProvider: "边境计划管理局",
    taxNotice: "依法归属于获奖者的税费由获奖者承担；依法需代扣代缴的，由运营主体依法办理",
    rewardProcessOpenWithinDays: 7,
    status: "draft",
    updatedAt: new Date(0).toISOString(),
    publishedAt: null,
  };
}
