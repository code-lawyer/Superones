export const FRONTIER_RULES_REVISION = "2026-07-22";
export const PRIZE_NOTICE_REVISION = "2026-07-22";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const SEASON_NAMES = ["春季赛", "夏季赛", "秋季赛", "冬季赛"] as const;

export type FrontierSeason = {
  code: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: "open" | "settling" | "settled" | "archived";
};

export type RankableSubmission = {
  id: string;
  repository: string;
  description: string;
  baseline: number;
  current: number;
  verifiedAt: string;
};

export type RankedSubmission = RankableSubmission & {
  rank: number;
  delta: number;
};

export type PrizeDrawAssignment = {
  submissionId: string;
  prizeDonationId: string;
  drawOrder: number;
};

function seasonBounds(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3;
  const startMs = Date.UTC(year, startMonth, 1) - BEIJING_OFFSET_MS;
  const nextYear = quarter === 4 ? year + 1 : year;
  const nextMonth = quarter === 4 ? 0 : startMonth + 3;
  const nextStartMs = Date.UTC(nextYear, nextMonth, 1) - BEIJING_OFFSET_MS;
  return { startMs, endMs: nextStartMs - 1 };
}

export function seasonFromCode(code: string): FrontierSeason {
  const match = /^(\d{4})-Q([1-4])$/.exec(code);
  if (!match) throw new Error("赛季代码无效。");
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const { startMs, endMs } = seasonBounds(year, quarter);
  return {
    code,
    name: `${year} ${SEASON_NAMES[quarter - 1]}`,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    status: "open",
  };
}

export function seasonForDate(value: Date = new Date()): FrontierSeason {
  const beijing = new Date(value.getTime() + BEIJING_OFFSET_MS);
  const year = beijing.getUTCFullYear();
  const quarter = Math.floor(beijing.getUTCMonth() / 3) + 1;
  return seasonFromCode(`${year}-Q${quarter}`);
}

export function previousSeason(value: Date = new Date()): FrontierSeason {
  const current = seasonForDate(value);
  const match = /^(\d{4})-Q([1-4])$/.exec(current.code);
  if (!match) throw new Error("当前赛季代码无效。");
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  return seasonFromCode(quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`);
}

export function nextSeason(code: string): FrontierSeason {
  const match = /^(\d{4})-Q([1-4])$/.exec(code);
  if (!match) throw new Error("赛季代码无效。");
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  return seasonFromCode(quarter === 4 ? `${year + 1}-Q1` : `${year}-Q${quarter + 1}`);
}

export function rankSubmissions(items: RankableSubmission[]): RankedSubmission[] {
  return items
    .map((item) => ({ ...item, rank: 0, delta: item.current - item.baseline }))
    .sort((left, right) =>
      right.delta - left.delta ||
      right.current - left.current ||
      left.verifiedAt.localeCompare(right.verifiedAt) ||
      left.repository.localeCompare(right.repository),
    )
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function drawRandomPrizes(
  ranked: RankedSubmission[],
  prizeDonationIds: string[],
  randomIndex: (upperExclusive: number) => number,
): { assignments: PrizeDrawAssignment[]; remainingPrizeDonationIds: string[] } {
  const remaining = [...prizeDonationIds];
  const assignments: PrizeDrawAssignment[] = [];

  for (const submission of ranked) {
    if (remaining.length === 0) break;
    const index = randomIndex(remaining.length);
    if (!Number.isInteger(index) || index < 0 || index >= remaining.length) {
      throw new Error("随机奖品索引无效。");
    }
    const [prizeDonationId] = remaining.splice(index, 1);
    assignments.push({ submissionId: submission.id, prizeDonationId, drawOrder: assignments.length + 1 });
  }

  return { assignments, remainingPrizeDonationIds: remaining };
}

export function beijingSeasonDate(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
