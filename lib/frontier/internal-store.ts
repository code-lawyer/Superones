import "server-only";

import { FRONTIER_RULES_REVISION } from "../frontier-domain.ts";
import { mutateStateDocument, readStateDocument, type StateDocumentDefinition } from "../state-document-store.ts";
import type {
  FrontierSeasonConfiguration,
  SeasonResult,
  SettlementRun,
  StoredPrizeDonation,
  StoredSubmission,
  SubmissionStatus,
  SubmissionSnapshot,
} from "./model.ts";

type FrontierStoreState = {
  version: 6;
  submissions: StoredSubmission[];
  prizeDonations: StoredPrizeDonation[];
  snapshots: SubmissionSnapshot[];
  seasonResults: SeasonResult[];
  settlementRuns: SettlementRun[];
  championRepositories: string[];
  seasonConfigurations: FrontierSeasonConfiguration[];
  mutationMetrics: Array<{ hour: string; count: number }>;
};

type PreviousVersion6Store = Omit<FrontierStoreState, "mutationMetrics">;
type Version5Submission = Omit<StoredSubmission, "status" | "verificationError"> & {
  status: Exclude<SubmissionStatus, "rejected">;
};
type Version5Store = Omit<PreviousVersion6Store, "version" | "submissions"> & {
  version: 5;
  submissions: Version5Submission[];
};
type Version4SeasonConfiguration = Omit<
  FrontierSeasonConfiguration,
  "taxNotice" | "rewardProcessOpenWithinDays"
> & {
  taxNotice: "奖励产生的税费由获奖者自行承担";
  deliveryDeadlineDays: 7;
};
type Version4Store = Omit<Version5Store, "version" | "seasonConfigurations"> & {
  version: 4;
  seasonConfigurations: Version4SeasonConfiguration[];
};
type Version3Store = Omit<Version5Store, "version" | "seasonConfigurations"> & { version: 3 };
type Version2Store = Omit<Version3Store, "version" | "settlementRuns"> & { version: 2 };
type LegacyStore = {
  version: 1;
  submissions: Array<
    Omit<StoredSubmission, "rulesRevision" | "rulesAcceptedAt" | "settlementReason" | "verificationError" | "status">
    & { status: "pending" | "verified" | "disqualified"; reviewNote?: string | null }
  >;
  winnerRepositories: string[];
};

function defaultStore(): FrontierStoreState {
  return {
    version: 6,
    submissions: [],
    prizeDonations: [],
    snapshots: [],
    seasonResults: [],
    settlementRuns: [],
    championRepositories: [],
    seasonConfigurations: [],
    mutationMetrics: [],
  };
}

function migrateSubmissions(submissions: Version5Submission[]): StoredSubmission[] {
  return submissions.map((submission) => ({ ...submission, verificationError: null }));
}

function migrateStore(
  parsed: FrontierStoreState | PreviousVersion6Store | Version5Store | Version4Store | Version3Store | Version2Store | LegacyStore,
): FrontierStoreState {
  if (parsed.version === 6) {
    return {
      ...parsed,
      mutationMetrics: "mutationMetrics" in parsed && Array.isArray(parsed.mutationMetrics)
        ? parsed.mutationMetrics
        : [],
    };
  }
  if (parsed.version === 5) {
    return { ...parsed, version: 6, submissions: migrateSubmissions(parsed.submissions), mutationMetrics: [] };
  }
  if (parsed.version === 4) {
    return {
      ...parsed,
      version: 6,
      submissions: migrateSubmissions(parsed.submissions),
      seasonConfigurations: parsed.seasonConfigurations.map((configuration) => {
        const { deliveryDeadlineDays: _, ...rest } = configuration;
        return {
          ...rest,
          rewardProvider: "边境计划管理局",
          taxNotice: "依法归属于获奖者的税费由获奖者承担；依法需代扣代缴的，由运营主体依法办理",
          rewardProcessOpenWithinDays: 7,
        };
      }),
      mutationMetrics: [],
    };
  }
  if (parsed.version === 3) {
    return {
      ...parsed,
      version: 6,
      submissions: migrateSubmissions(parsed.submissions),
      seasonConfigurations: [],
      mutationMetrics: [],
    };
  }
  if (parsed.version === 2) {
    return {
      ...parsed,
      version: 6,
      submissions: migrateSubmissions(parsed.submissions),
      settlementRuns: [],
      seasonConfigurations: [],
      mutationMetrics: [],
    };
  }
  return {
    ...defaultStore(),
    submissions: parsed.submissions.map((item) => ({
      ...item,
      status: item.status === "disqualified" ? "ineligible_at_settlement" : item.status,
      rulesRevision: FRONTIER_RULES_REVISION,
      rulesAcceptedAt: item.createdAt,
      verificationError: null,
      settlementReason: item.reviewNote ?? null,
    })),
    championRepositories: parsed.winnerRepositories.map((item) => item.toLowerCase()),
  };
}

function validateStore(store: FrontierStoreState) {
  if (
    store.version !== 6
    || !Array.isArray(store.settlementRuns)
    || !Array.isArray(store.submissions)
    || !Array.isArray(store.prizeDonations)
    || !Array.isArray(store.snapshots)
    || !Array.isArray(store.seasonResults)
    || !Array.isArray(store.championRepositories)
    || !Array.isArray(store.seasonConfigurations)
    || !Array.isArray(store.mutationMetrics)
    || store.mutationMetrics.some((item) => !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(item.hour) || !Number.isSafeInteger(item.count) || item.count < 0)
  ) throw new Error("边境计划数据文件格式无效。");
  return store;
}

const frontierDocument: StateDocumentDefinition<FrontierStoreState> = {
  namespace: "frontier",
  fileName: "mvp-store.json",
  create: defaultStore,
  parse: (value) => validateStore(migrateStore(
    value as FrontierStoreState | PreviousVersion6Store | Version5Store | Version4Store | Version3Store | Version2Store | LegacyStore,
  )),
};

export async function readFrontierStore(): Promise<FrontierStoreState> {
  return readStateDocument(frontierDocument);
}

export async function mutateFrontierStore<T>(mutator: (store: FrontierStoreState) => T | Promise<T>): Promise<T> {
  return mutateStateDocument(frontierDocument, async (store) => {
    const result = await mutator(store);
    const hour = new Date().toISOString().slice(0, 13);
    const metric = store.mutationMetrics.find((item) => item.hour === hour);
    if (metric) metric.count += 1;
    else store.mutationMetrics.push({ hour, count: 1 });
    const oldestRetainedHour = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 13);
    store.mutationMetrics = store.mutationMetrics
      .filter((item) => item.hour >= oldestRetainedHour)
      .slice(-168);
    return result;
  });
}
