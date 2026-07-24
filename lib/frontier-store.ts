import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  FRONTIER_RULES_REVISION,
  PRIZE_NOTICE_REVISION,
  nextSeason,
  rankSubmissions,
  seasonForDate,
  seasonFromCode,
  type PrizeDrawAssignment,
  type RankedSubmission,
} from "./frontier-domain";
import type { FrontierEntry } from "./types";

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

type FrontierStore = {
  version: 2;
  submissions: StoredSubmission[];
  prizeDonations: StoredPrizeDonation[];
  snapshots: SubmissionSnapshot[];
  seasonResults: SeasonResult[];
  championRepositories: string[];
};

type LegacyStore = {
  version: 1;
  submissions: Array<Omit<StoredSubmission, "rulesRevision" | "rulesAcceptedAt" | "settlementReason" | "status"> & { status: "pending" | "verified" | "disqualified"; reviewNote?: string | null }>;
  winnerRepositories: string[];
};

export type AdminSubmission = Omit<StoredSubmission, "emailEncrypted" | "challengeHash"> & { email: string };
export type AdminPrizeDonation = Omit<StoredPrizeDonation, "emailEncrypted"> & { email: string };
export type PublicPrizeDonation = Pick<StoredPrizeDonation, "id" | "season" | "name" | "description" | "status">;

const storePath = path.join(process.cwd(), "data", "mvp-store.json");
let writeChain: Promise<void> = Promise.resolve();

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function keyForSensitiveData() {
  const configured = process.env.VAULT2077_DATA_KEY;
  if (configured) return createHash("sha256").update(configured).digest();
  if (process.env.NODE_ENV === "production") throw new Error("生产环境必须设置 VAULT2077_DATA_KEY。");
  return createHash("sha256").update("vault2077-local-development-key").digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyForSensitiveData(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("联系人数据格式无效。");
  const decipher = createDecipheriv("aes-256-gcm", keyForSensitiveData(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

function defaultStore(): FrontierStore {
  return { version: 2, submissions: [], prizeDonations: [], snapshots: [], seasonResults: [], championRepositories: [] };
}

function migrateStore(parsed: FrontierStore | LegacyStore): FrontierStore {
  if (parsed.version === 2) return parsed;
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
    store.version !== 2 ||
    !Array.isArray(store.submissions) ||
    !Array.isArray(store.prizeDonations) ||
    !Array.isArray(store.snapshots) ||
    !Array.isArray(store.seasonResults) ||
    !Array.isArray(store.championRepositories)
  ) throw new Error("边境计划数据文件格式无效。");
  return store;
}

async function ensureStore() {
  await mkdir(path.dirname(storePath), { recursive: true });
  try {
    await readFile(storePath, "utf8");
  } catch {
    await writeFile(storePath, `${JSON.stringify(defaultStore(), null, 2)}\n`, "utf8");
  }
}

async function readStore(): Promise<FrontierStore> {
  await ensureStore();
  const parsed = JSON.parse(await readFile(storePath, "utf8")) as FrontierStore | LegacyStore;
  return validateStore(migrateStore(parsed));
}

async function writeStore(store: FrontierStore) {
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", flag: "w" });
  await rename(temporaryPath, storePath);
}

async function mutateStore<T>(mutator: (store: FrontierStore) => T | Promise<T>): Promise<T> {
  const operation = writeChain.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });
  writeChain = operation.then(() => undefined, () => undefined);
  return operation;
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
    emailEncrypted: encrypt(input.email),
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
    emailEncrypted: encrypt(input.email),
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
    .map(({ emailEncrypted, ...item }) => ({ ...item, email: decrypt(emailEncrypted) }))
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
    .map(({ emailEncrypted, challengeHash: _challengeHash, ...submission }) => ({ ...submission, email: decrypt(emailEncrypted) }))
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
    if (existing) return existing;
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
