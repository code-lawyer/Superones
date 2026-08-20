import type { PrizeDrawAssignment, RankedSubmission } from "../frontier-domain.ts";

export type SubmissionStatus = "pending" | "rejected" | "verified" | "settled" | "ineligible_at_settlement";
export type PrizeDonationStatus = "pending_confirmation" | "available" | "rejected" | "withdrawn" | "assigned" | "carried_over";

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
  verificationError: string | null;
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

export type FrontierSeasonConfiguration = {
  season: string;
  officialReward: string;
  rewardProvider: "边境计划管理局";
  taxNotice: "依法归属于获奖者的税费由获奖者承担；依法需代扣代缴的，由运营主体依法办理";
  rewardProcessOpenWithinDays: 7;
  status: "draft" | "published";
  updatedAt: string;
  publishedAt: string | null;
};

export type AdminSubmission = Omit<StoredSubmission, "emailEncrypted" | "challengeHash"> & { email: string };
export type AdminPrizeDonation = Omit<StoredPrizeDonation, "emailEncrypted"> & { email: string };
export type PublicPrizeDonationStatus = Extract<PrizeDonationStatus, "available" | "assigned" | "carried_over">;
export type PublicPrizeDonation = Pick<StoredPrizeDonation, "id" | "season" | "name" | "description"> & {
  status: PublicPrizeDonationStatus;
};

export type FrontierStorageDiagnostics = {
  strategy: "single-state-document";
  documentBytes: number;
  submissionCount: number;
  prizeDonationCount: number;
  snapshotCount: number;
  seasonResultCount: number;
  peakMutationsPerHour: number;
  lockWaitEvidence: "postgresql-telemetry-required";
  normalizationRecommended: boolean;
  reasons: string[];
};
