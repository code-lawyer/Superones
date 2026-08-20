import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { FRONTIER_RULES_REVISION, seasonForDate, seasonFromCode } from "../frontier-domain.ts";
import { encryptSensitiveText } from "../sensitive-data.ts";
import { mutateFrontierStore, readFrontierStore } from "./internal-store.ts";
import type { StoredSubmission } from "./model.ts";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashChallenge(challenge: string) {
  return hash(challenge);
}

export function challengeMatches(challenge: string, expectedHash: string) {
  const incoming = Buffer.from(hash(challenge), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return incoming.length === expected.length && timingSafeEqual(incoming, expected);
}

export class FrontierSubmissionConflictError extends Error {
  readonly code: "PAST_CHAMPION" | "ALREADY_VERIFIED";

  constructor(code: "PAST_CHAMPION" | "ALREADY_VERIFIED", message: string) {
    super(message);
    this.name = "FrontierSubmissionConflictError";
    this.code = code;
  }
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
    verificationError: null,
    rulesRevision: FRONTIER_RULES_REVISION,
    rulesAcceptedAt: now.toISOString(),
    settlementReason: null,
  };

  await mutateFrontierStore((store) => {
    if (store.championRepositories.includes(repository.toLowerCase())) {
      throw new FrontierSubmissionConflictError("PAST_CHAMPION", "该仓库已成为往届季度冠军，不能再次参赛。");
    }
    const existingVerified = store.submissions.find((item) => (
      item.season === season.code
      && item.repository.toLowerCase() === repository.toLowerCase()
      && item.status !== "pending"
      && item.status !== "rejected"
    ));
    if (existingVerified) {
      throw new FrontierSubmissionConflictError("ALREADY_VERIFIED", "该仓库已经通过本赛季验证，无需重复报名。");
    }
    store.submissions = store.submissions.filter((item) => !(
      item.season === season.code
      && item.repository.toLowerCase() === repository.toLowerCase()
      && (item.status === "pending" || item.status === "rejected")
    ));
    store.submissions.push(submission);
  });
  return submission;
}

export async function removePendingSubmission(id: string) {
  return mutateFrontierStore((store) => {
    const before = store.submissions.length;
    store.submissions = store.submissions.filter((item) => item.id !== id || item.status !== "pending");
    return store.submissions.length !== before;
  });
}

export async function rejectPendingSubmission(id: string, verificationError: string) {
  return mutateFrontierStore((store) => {
    const submission = store.submissions.find((item) => item.id === id);
    if (!submission || submission.status !== "pending") return null;
    submission.status = "rejected";
    submission.verificationError = verificationError;
    return submission;
  });
}

export async function removePendingSubmissions(ids: readonly string[]) {
  if (ids.length === 0) return 0;
  const removing = new Set(ids);
  return mutateFrontierStore((store) => {
    const before = store.submissions.length;
    store.submissions = store.submissions.filter((item) => item.status !== "pending" || !removing.has(item.id));
    return before - store.submissions.length;
  });
}

export async function updatePendingSubmissionRepository(id: string, input: { defaultBranch: string }) {
  return mutateFrontierStore((store) => {
    const submission = store.submissions.find((item) => item.id === id);
    if (!submission || submission.status !== "pending") return null;
    submission.defaultBranch = input.defaultBranch;
    return submission;
  });
}

export async function applyFrontierVerificationObservation(input: {
  submissionId: string;
  season: string;
  defaultBranch: string;
  stars: number;
  challenge?: string;
  capturedAt: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return mutateFrontierStore((store) => {
    const submission = store.submissions.find((item) => item.id === input.submissionId && item.season === input.season);
    if (!submission) return "missing" as const;
    if (submission.status === "verified") return "verified" as const;
    if (submission.status !== "pending") return "ineligible" as const;
    if (Date.parse(submission.challengeExpiresAt) <= now.getTime()) {
      store.submissions = store.submissions.filter((item) => item.id !== submission.id);
      return "challenge-expired" as const;
    }
    if (Date.parse(seasonFromCode(submission.season).endsAt) < now.getTime()) {
      store.submissions = store.submissions.filter((item) => item.id !== submission.id);
      return "season-closed" as const;
    }
    submission.defaultBranch = input.defaultBranch;
    if (!input.challenge) return "inspected" as const;
    if (!challengeMatches(input.challenge, submission.challengeHash)) return "challenge-mismatch" as const;
    submission.status = "verified";
    submission.verificationError = null;
    submission.verifiedAt = input.capturedAt;
    submission.baselineStars = input.stars;
    submission.currentStars = input.stars;
    submission.lastSnapshotAt = input.capturedAt;
    store.snapshots.push({
      submissionId: submission.id,
      season: submission.season,
      capturedAt: input.capturedAt,
      stars: input.stars,
    });
    return "verified" as const;
  });
}

export async function getSubmission(id: string) {
  const store = await readFrontierStore();
  return store.submissions.find((item) => item.id === id) ?? null;
}

export async function findSeasonSubmission(owner: string, repo: string, season = seasonForDate().code) {
  const repository = `${owner}/${repo}`.toLowerCase();
  const store = await readFrontierStore();
  return store.submissions
    .filter((item) => item.season === season && item.repository.toLowerCase() === repository)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

export async function markSubmissionVerified(id: string, stars: number, now: Date = new Date()) {
  return mutateFrontierStore((store) => {
    const submission = store.submissions.find((item) => item.id === id);
    if (!submission) throw new Error("报名记录不存在。");
    if (submission.status === "verified") return submission;
    if (submission.status !== "pending") throw new Error("该报名记录当前不能验证。");
    const capturedAt = now.toISOString();
    submission.status = "verified";
    submission.verificationError = null;
    submission.verifiedAt = capturedAt;
    submission.baselineStars = stars;
    submission.currentStars = stars;
    submission.lastSnapshotAt = capturedAt;
    store.snapshots.push({ submissionId: submission.id, season: submission.season, capturedAt, stars });
    return submission;
  });
}

export type { StoredSubmission } from "./model.ts";
