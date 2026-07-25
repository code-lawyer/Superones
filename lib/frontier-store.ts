import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  FRONTIER_RULES_REVISION,
  PRIZE_NOTICE_REVISION,
  nextSeason,
  rankSubmissions,
  seasonForDate,
  seasonFromCode,
  type PrizeDrawAssignment,
  type RankedSubmission,
} from "./frontier-domain.ts";
import { mutateStateDocument, readStateDocument, type StateDocumentDefinition } from "./state-document-store.ts";
import { decryptSensitiveText, encryptSensitiveText } from "./sensitive-data.ts";
import type { FrontierEntry } from "./types.ts";

export const OFFICIAL_CHAMPION_REWARD = "边境计划季度冠军奖励（待公布）";

type SubmissionStatus = "pending" | "verified" | "settled" | "ineligible_at_settlement";
export type PrizeDonationStatus = "pending_confirmation" | "available" | "rejected" | "withdrawn" | "assigned";

export type StoredSubmission = {
  id: string;
  season: string;
  owner: string;
  repo: string;
  repository: string;
  emailEncrypted: string;
  note: string;
  defaultBranch: string;
  challengeHash: string;
  challengeExpiresAt: string;
  createdAt: string;
  verifiedAt: string | null;
  baselineStars: number | null;
  currentStars: number | null;
  lastSnapshotAt: string | null;
  status: SubmissionStatus;
  rulesRevision: string;
  rulesAcceptedAt: string;
  settlementReason: string | null;
};

export type StoredPrizeDonation = {
  id: string;
  season: string;
  name: string;
  description: string;
  emailEncrypted: string;
  status: PrizeDonationStatus;
  createdAt: string;
  confirmedAt: string | null;
  noticeRevision: string;
  noticeAcceptedAt: string;
};

export type SubmissionSnapshot = {
  submissionId: string;
  season: string;
  capturedAt: string;
  stars: number;
};

export type SeasonResult = {
  season: string;
  settledAt: string;
  officialReward: string;
  championSubmissionId: string | null;
  finalRankings: RankedSubmission[];
  ineligibleSubmissionIds: string[];
  assignments: Array<PrizeDrawAssignment & { assignedAt: string }>;
};

export type SettlementRun = {
  season: string;
  status: "settling" | "failed" | "settled";
  attempt: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  lastError: string | null;
};

type FrontierStore = {
  version: 3;
  submissions: StoredSubmission[];
  prizeDonations: StoredPrizeDonation[];
  snapshots: SubmissionSnapshot[];
  seasonResults: SeasonResult[];
  settlementRuns: SettlementRun[];
  championRepositories: string[];
};

type Version2Store = Omit<FrontierStore, "version" | "settlementRuns"> & { version: 2 };

type LegacyStore = {
  version: 1;
  submissions: Array<Omit<StoredSubmission, "rulesRevision" | "rulesAcceptedAt" | "settlementReason" | "status"> & { status: "pending" | "verified" | "disqualified"; reviewNote?: string | null }>;
  winnerRepositories: string[];
};

export type AdminSubmission = Omit<StoredSubmission, "emailEncrypted" | "challengeHash"> & { email: string };
export type AdminPrizeDonation = Omit<StoredPrizeDonation, "emailEncrypted"> & { email: string };
export type PublicPrizeDonation = Pick<StoredPrizeDonation, "id" | "season" | "name" | "description" | "status">;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function defaultStore(): FrontierStore {
  return {
    version: 3,
    submissions: [],
    prizeDonations: [],
    snapshots: [],
    seasonResults: [],
    settlementRuns: [],
    championRepositories: [],
  };
}

function migrateStore(parsed: FrontierStore | Version2Store | LegacyStore): FrontierStore {
  if (parsed.version === 3) return parsed;
  if (parsed.version === 2) return { ...parsed, version: 3, settlementRuns: [] };
  return {
    ...defaultStore(),
    submissions: parsed.submissions.map((item) => ({
      ...item,
      status: item.status === "disqualified" ? "ineligible_at_settlement" : item.status,
      rulesRevision: FRONTIER_RULES_REVISION,
      rulesAcceptedAt: item.createdAt,
      settlementReason: item.reviewNote ?? null,
    })),
    championRepositories: parsed.winnerRepositories.map((item) => item.toLowerCase()),
  };
}

function validateStore(store: FrontierStore) {
  if (
    store.version !== 3 ||
    !Array.isArray(store.settlementRuns) ||
    !Array.isArray(store.submissions) ||
    !Array.isArray(store.prizeDonations) ||
    !Array.isArray(store.snapshots) ||
    !Array.isArray(store.seasonResults) ||
    !Array.isArray(store.championRepositories)
  ) throw new Error("边境计划数据文件格式无效。");
  return store;
}

const frontierDocument: StateDocumentDefinition<FrontierStore> = {
  namespace: "frontier",
  fileName: "mvp-store.json",
  create: defaultStore,
  parse: (value) => validateStore(migrateStore(value as FrontierStore | Version2Store | LegacyStore)),
};

async function readStore(): Promise<FrontierStore> {
  return readStateDocument(frontierDocument);
}

async function mutateStore<T>(mutator: (store: FrontierStore) => T | Promise<T>): Promise<T> {
  return mutateStateDocument(frontierDocument, mutator);
}

export function hashChallenge(challenge: string) {
  return hash(challenge);
}

export function challengeMatches(challenge: string, expectedHash: string) {
  const incoming = Buffer.from(hash(challenge), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return incoming.length === expected.length && timingSafeEqual(incoming, expected);
}

export function currentSeason(now: Date = new Date()) {
  return seasonForDate(now);
}

export async function createPendingSubmission(input: {
  owner: string;
  repo: string;
  email: string;
  note: string;
  defaultBranch: string;
  challenge: string;
  rulesAccepted: boolean;
  now?: Date;
}) {
  if (!input.rulesAccepted) throw new Error("请先阅读并同意边境计划参赛规则。");
  const now = input.now ?? new Date();
  const season = seasonForDate(now);
  const repository = `${input.owner}/${input.repo}`;
  const submission: StoredSubmission = {
    id: randomUUID(),
    season: season.code,
    owner: input.owner,
    repo: input.repo,
    repository,
    emailEncrypted: encryptSensitiveText(input.email),
    note: input.note,
    defaultBranch: input.defaultBranch,
    challengeHash: hashChallenge(input.challenge),
    challengeExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now.toISOString(),
    verifiedAt: null,
    baselineStars: null,
    currentStars: null,
    lastSnapshotAt: null,
    status: "pending",
    rulesRevision: FRONTIER_RULES_REVISION,
    rulesAcceptedAt: now.toISOString(),
    settlementReason: null,
  };

  await mutateStore((store) => {
    if (store.championRepositories.includes(repository.toLowerCase())) throw new Error("该仓库已成为往届季度冠军，不能再次参赛。");
    const existingVerified = store.submissions.find((item) => item.season === season.code && item.repository.toLowerCase() === repository.toLowerCase() && item.status !== "pending");
    if (existingVerified) throw new Error("该仓库已经通过本赛季验证，无需重复报名。");
    store.submissions = store.submissions.filter((item) => !(item.season === season.code && item.repository.toLowerCase() === repository.toLowerCase() && item.status === "pending"));
    store.submissions.push(submission);
  });

  return submission;
}

export async function getSubmission(id: string) {
  const store = await readStore();
  return store.submissions.find((item) => item.id === id) ?? null;
}

export async function findSeasonSubmission(owner: string, repo: string, season = seasonForDate().code) {
  const repository = `${owner}/${repo}`.toLowerCase();
  const store = await readStore();
  return store.submissions
    .filter((item) => item.season === season && item.repository.toLowerCase() === repository)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

export async function markSubmissionVerified(id: string, stars: number, now: Date = new Date()) {
  return mutateStore((store) => {
    const submission = store.submissions.find((item) => item.id === id);
    if (!submission) throw new Error("报名记录不存在。");
    if (submission.status === "verified") return submission;
    if (submission.status !== "pending") throw new Error("该报名记录当前不能验证。");
    const capturedAt = now.toISOString();
    submission.status = "verified";
    submission.verifiedAt = capturedAt;
    submission.baselineStars = stars;
    submission.currentStars = stars;
    submission.lastSnapshotAt = capturedAt;
    store.snapshots.push({ submissionId: submission.id, season: submission.season, capturedAt, stars });
    return submission;
  });
}

export async function recordStarSnapshots(season: string, updates: Array<{ submissionId: string; stars: number }>, capturedAt = new Date().toISOString()) {
  return mutateStore((store) => {
    for (const update of updates) {
      const submission = store.submissions.find((item) => item.id === update.submissionId && item.season === season && item.status === "verified");
      if (!submission) continue;
      submission.currentStars = update.stars;
      submission.lastSnapshotAt = capturedAt;
      store.snapshots.push({ submissionId: submission.id, season, capturedAt, stars: update.stars });
    }
    store.snapshots = store.snapshots.slice(-20_000);
    return updates.length;
  });
}

export async function updateSubmissionStars(id: string, stars: number) {
  const submission = await getSubmission(id);
  if (!submission) throw new Error("报名记录不存在。");
  await recordStarSnapshots(submission.season, [{ submissionId: id, stars }]);
  return getSubmission(id);
}

export async function listVerifiedSubmissions(season = seasonForDate().code) {
  const store = await readStore();
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
  return verified.map((item) => item.lastSnapshotAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
}

export async function createPrizeDonation(input: { name: string; description: string; email: string; noticeAccepted: boolean; now?: Date }) {
  if (!input.noticeAccepted) throw new Error("请先阅读并同意奖品捐献须知。");
  const now = input.now ?? new Date();
  const donation: StoredPrizeDonation = {
    id: randomUUID(),
    season: seasonForDate(now).code,
    name: input.name,
    description: input.description,
    emailEncrypted: encryptSensitiveText(input.email),
    status: "pending_confirmation",
    createdAt: now.toISOString(),
    confirmedAt: null,
    noticeRevision: PRIZE_NOTICE_REVISION,
    noticeAcceptedAt: now.toISOString(),
  };
  await mutateStore((store) => { store.prizeDonations.push(donation); });
  return donation;
}

export async function listPublicPrizePool(season = seasonForDate().code): Promise<PublicPrizeDonation[]> {
  const store = await readStore();
  return store.prizeDonations
    .filter((item) => item.season === season && (item.status === "available" || item.status === "assigned"))
    .map(({ id, season: itemSeason, name, description, status }) => ({ id, season: itemSeason, name, description, status }));
}

export async function listAdminPrizeDonations(): Promise<AdminPrizeDonation[]> {
  const store = await readStore();
  return store.prizeDonations
    .map(({ emailEncrypted, ...item }) => ({ ...item, email: decryptSensitiveText(emailEncrypted) }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function setPrizeDonationStatus(id: string, action: "confirm" | "reject" | "withdraw") {
  return mutateStore((store) => {
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
      if (donation.status !== "available") throw new Error("只有已确认且尚未分配的奖品可以撤回。");
      donation.status = "withdrawn";
    }
    return donation;
  });
}

export async function listAdminSubmissions(): Promise<AdminSubmission[]> {
  const store = await readStore();
  return store.submissions
    .map(({ emailEncrypted, challengeHash: _challengeHash, ...submission }) => ({ ...submission, email: decryptSensitiveText(emailEncrypted) }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function listUnsettledSeasonCodes(now: Date = new Date()) {
  const store = await readStore();
  const settled = new Set(store.seasonResults.map((item) => item.season));
  const candidates = new Set<string>();
  for (const item of [...store.submissions, ...store.prizeDonations]) candidates.add(item.season);
  return [...candidates]
    .filter((code) => !settled.has(code) && new Date(seasonFromCode(code).endsAt).getTime() <= now.getTime())
    .sort();
}

export async function beginSeasonSettlement(season: string, now = new Date()) {
  return mutateStore((store) => {
    if (store.seasonResults.some((item) => item.season === season)) return "settled" as const;
    const timestamp = now.toISOString();
    const existing = store.settlementRuns.find((item) => item.season === season);
    if (
      existing?.status === "settling"
      && Date.parse(existing.updatedAt) > now.getTime() - 30 * 60 * 1000
    ) return "busy" as const;
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
  return mutateStore((store) => {
    const run = store.settlementRuns.find((item) => item.season === season);
    if (!run || run.status !== "settling") return false;
    run.status = "failed";
    run.updatedAt = now.toISOString();
    run.completedAt = now.toISOString();
    run.lastError = (error instanceof Error ? error.message : String(error))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
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
  return mutateStore((store) => {
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
    const result: SeasonResult = {
      season: input.season,
      settledAt: input.settledAt,
      officialReward: input.officialReward ?? OFFICIAL_CHAMPION_REWARD,
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
      else if (input.remainingPrizeDonationIds.includes(donation.id) && donation.status === "available") donation.season = next.code;
      else if (donation.status === "pending_confirmation") donation.season = next.code;
    }
    return result;
  });
}

export async function listSeasonHistory(): Promise<Array<SeasonResult & { championRepository: string | null; prizeAssignments: Array<{ repository: string; prizeName: string }> }>> {
  const store = await readStore();
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
  const store = await readStore();
  return store.seasonResults.find((item) => item.season === season) ?? null;
}
