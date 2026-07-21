import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FrontierEntry } from "./types";

export const CURRENT_SEASON = {
  code: "2026-Q3",
  name: "2026 夏季赛",
  startsAt: "2026-07-01T00:00:00+08:00",
  endsAt: "2026-09-30T23:59:59+08:00",
} as const;

type SubmissionStatus = "pending" | "verified" | "disqualified";

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
  reviewNote: string | null;
};

type FrontierStore = {
  version: 1;
  submissions: StoredSubmission[];
  winnerRepositories: string[];
};

export type AdminSubmission = Omit<StoredSubmission, "emailEncrypted" | "challengeHash"> & {
  email: string;
};

const storePath = path.join(process.cwd(), "data", "mvp-store.json");
let writeChain: Promise<void> = Promise.resolve();

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function keyForSensitiveData() {
  const configured = process.env.VAULT2077_DATA_KEY;
  if (configured) return createHash("sha256").update(configured).digest();
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须设置 VAULT2077_DATA_KEY。");
  }
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
  return { version: 1, submissions: [], winnerRepositories: [] };
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
  const parsed = JSON.parse(await readFile(storePath, "utf8")) as FrontierStore;
  if (parsed.version !== 1 || !Array.isArray(parsed.submissions) || !Array.isArray(parsed.winnerRepositories)) {
    throw new Error("MVP 数据文件格式无效。");
  }
  return parsed;
}

async function mutateStore<T>(mutator: (store: FrontierStore) => T | Promise<T>): Promise<T> {
  const operation = writeChain.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
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

export async function createPendingSubmission(input: {
  owner: string;
  repo: string;
  email: string;
  note: string;
  defaultBranch: string;
  challenge: string;
}) {
  const now = new Date();
  const repository = `${input.owner}/${input.repo}`;
  const submission: StoredSubmission = {
    id: randomUUID(),
    season: CURRENT_SEASON.code,
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
    reviewNote: null,
  };

  await mutateStore((store) => {
    if (store.winnerRepositories.includes(repository.toLowerCase())) {
      throw new Error("该仓库已进入历史获奖名单，不能再次参加边境计划。");
    }
    const existingVerified = store.submissions.find((item) => item.season === CURRENT_SEASON.code && item.repository.toLowerCase() === repository.toLowerCase() && item.status === "verified");
    if (existingVerified) {
      throw new Error("该仓库已经通过本赛季验证，无需重复报名。");
    }
    store.submissions = store.submissions.filter((item) => !(item.season === CURRENT_SEASON.code && item.repository.toLowerCase() === repository.toLowerCase() && item.status === "pending"));
    store.submissions.push(submission);
  });

  return submission;
}

export async function getSubmission(id: string) {
  const store = await readStore();
  return store.submissions.find((item) => item.id === id) ?? null;
}

export async function markSubmissionVerified(id: string, stars: number) {
  return mutateStore((store) => {
    const submission = store.submissions.find((item) => item.id === id);
    if (!submission) throw new Error("报名记录不存在。");
    const now = new Date().toISOString();
    submission.status = "verified";
    submission.verifiedAt = now;
    submission.baselineStars = stars;
    submission.currentStars = stars;
    submission.lastSnapshotAt = now;
    submission.challengeHash = "";
    return submission;
  });
}

export async function updateSubmissionStars(id: string, stars: number) {
  return mutateStore((store) => {
    const submission = store.submissions.find((item) => item.id === id);
    if (!submission) throw new Error("报名记录不存在。");
    submission.currentStars = stars;
    submission.lastSnapshotAt = new Date().toISOString();
    return submission;
  });
}

export async function listVerifiedSubmissions() {
  const store = await readStore();
  return store.submissions.filter((item) => item.season === CURRENT_SEASON.code && item.status === "verified");
}

export async function listPublicRankings(): Promise<FrontierEntry[]> {
  const verified = await listVerifiedSubmissions();
  return verified
    .map((item) => {
      const baseline = item.baselineStars ?? 0;
      const current = item.currentStars ?? baseline;
      return {
        rank: 0,
        repo: item.repository,
        description: item.note || "参赛项目",
        baseline,
        current,
        delta: Math.max(0, current - baseline),
        submitted: item.verifiedAt ? item.verifiedAt.slice(0, 10) : item.createdAt.slice(0, 10),
      };
    })
    .sort((a, b) => b.delta - a.delta || b.current - a.current || a.submitted.localeCompare(b.submitted))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export async function listAdminSubmissions(): Promise<AdminSubmission[]> {
  const store = await readStore();
  return store.submissions
    .map(({ emailEncrypted, challengeHash: _challengeHash, ...submission }) => ({ ...submission, email: decrypt(emailEncrypted) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
