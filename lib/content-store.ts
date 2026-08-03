import "server-only";

import { mutateStateDocument, readStateDocument, type StateDocumentDefinition } from "./state-document-store.ts";
import type { BatchReceipt, ContentState, EventRecord, InformationItem, QuarantinedContent, TrendProject } from "./types.ts";

export type ContentSnapshotGroup = "information" | "roadside";

export type ContentSourceReport = {
  sourceId: string;
  status: "succeeded" | "partial" | "empty" | "failed";
  collectedAt: string;
  contentGroup?: ContentSnapshotGroup;
  errorCode?: string;
  errorMessage?: string;
};

function aggregateContentStatus(
  left: ContentSourceReport["status"],
  right: ContentSourceReport["status"],
): ContentSourceReport["status"] {
  if (left === "partial" || right === "partial") return "partial";
  if (left === "failed" && right === "failed") return "failed";
  if (left === "failed" || right === "failed") return "partial";
  if (left === "succeeded" || right === "succeeded") return "succeeded";
  return "empty";
}

export function mergeContentSourceReport(
  previous: ContentSourceReport | undefined,
  incoming: ContentSourceReport,
) {
  if (!previous || Date.parse(incoming.collectedAt) > Date.parse(previous.collectedAt)) return incoming;
  if (Date.parse(incoming.collectedAt) < Date.parse(previous.collectedAt)) return previous;
  const status = aggregateContentStatus(previous.status, incoming.status);
  const errorCode = previous.errorCode ?? incoming.errorCode;
  const errorMessage = [...new Set([previous.errorMessage, incoming.errorMessage].filter(Boolean))].join("；");
  return {
    ...incoming,
    status,
    ...(status === "partial" && !errorCode ? { errorCode: "SOURCE_PARTIAL" } : errorCode ? { errorCode } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

type ContentSourceSnapshot = {
  runId: string;
  collectedAt: string;
  contentGroup?: ContentSnapshotGroup;
};

type ContentStore = {
  version: 3;
  updatedAt: string | null;
  sourceCount: number;
  publicationVersion: number;
  events: EventRecord[];
  information: InformationItem[];
  projects: TrendProject[];
  quarantine: QuarantinedContent[];
  batches: BatchReceipt[];
  sourceSnapshots: Record<string, ContentSourceSnapshot>;
  sourceReports: Record<string, ContentSourceReport>;
};

type LegacyContentStore = {
  version: 1;
  updatedAt: string | null;
  sourceCount: number;
  events: EventRecord[];
  projects: TrendProject[];
};

function emptyStore(): ContentStore {
  return {
    version: 3,
    updatedAt: null,
    sourceCount: 0,
    publicationVersion: 0,
    events: [],
    information: [],
    projects: [],
    quarantine: [],
    batches: [],
    sourceSnapshots: {},
    sourceReports: {},
  };
}

function deduplicateInformation(items: InformationItem[]) {
  const urls = new Set<string>();
  const hashes = new Set<string>();
  const originIds = new Set<string>();
  return items.filter((item) => {
    const url = item.sourceUrl.replace(/[?#].*$/, "").toLowerCase();
    if (
      urls.has(url)
      || (item.contentHash ? hashes.has(item.contentHash) : false)
      || (item.originContentId ? originIds.has(item.originContentId) : false)
    ) return false;
    urls.add(url);
    if (item.contentHash) hashes.add(item.contentHash);
    if (item.originContentId) originIds.add(item.originContentId);
    return true;
  });
}

function legacySnapshotGroups(items: InformationItem[]) {
  const groups = new Map<string, ContentSnapshotGroup>();
  const ambiguous = new Set<string>();
  for (const item of items) {
    if (!item.sourceChannelId || ambiguous.has(item.sourceChannelId)) continue;
    const group: ContentSnapshotGroup = (item.contentGroup ?? item.sourceStream) === "roadside"
      ? "roadside"
      : "information";
    const previous = groups.get(item.sourceChannelId);
    if (previous && previous !== group) {
      groups.delete(item.sourceChannelId);
      ambiguous.add(item.sourceChannelId);
    } else {
      groups.set(item.sourceChannelId, group);
    }
  }
  return groups;
}

function mergeEventLedger(current: EventRecord[], incoming: EventRecord[]) {
  const bySlug = new Map(current.map((event) => [event.slug, event]));
  for (const event of incoming) {
    const previous = bySlug.get(event.slug);
    if (!previous || Date.parse(event.updated) >= Date.parse(previous.updated)) {
      bySlug.set(event.slug, event);
    }
  }
  return [...bySlug.values()].sort((left, right) => Date.parse(right.updated) - Date.parse(left.updated));
}

function parseStore(value: unknown): ContentStore {
  const parsed = value as ContentStore | LegacyContentStore | (Omit<ContentStore, "version" | "sourceSnapshots" | "sourceReports"> & { version: 2 });
  const store: ContentStore = parsed.version === 1
    ? { ...emptyStore(), updatedAt: parsed.updatedAt, sourceCount: parsed.sourceCount, events: parsed.events, projects: parsed.projects }
    : parsed.version === 2
      ? { ...parsed, version: 3, sourceSnapshots: {}, sourceReports: {} }
      : parsed;
  if (
    store.version !== 3 ||
    (store.updatedAt !== null && typeof store.updatedAt !== "string") ||
    typeof store.sourceCount !== "number" ||
    typeof store.publicationVersion !== "number" ||
    !Array.isArray(store.events) ||
    !Array.isArray(store.information) ||
    !Array.isArray(store.projects) ||
    !Array.isArray(store.quarantine) ||
    !Array.isArray(store.batches) ||
    !store.sourceSnapshots || typeof store.sourceSnapshots !== "object" || Array.isArray(store.sourceSnapshots) ||
    !store.sourceReports || typeof store.sourceReports !== "object" || Array.isArray(store.sourceReports)
  ) {
    throw new Error("信息流内容库格式无效。");
  }
  store.information = deduplicateInformation(store.information);
  return store;
}

const contentDocument: StateDocumentDefinition<ContentStore> = {
  namespace: "content",
  fileName: "content-store.json",
  create: emptyStore,
  parse: parseStore,
};

async function readStore() {
  return readStateDocument(contentDocument);
}

function contentState(store: ContentStore): ContentState {
  const hasContent = Boolean(store.updatedAt && (store.events.length > 0 || store.information.length > 0 || store.projects.length > 0));
  const delayed = Object.values(store.sourceReports).some((report) => report.status === "failed" || report.status === "partial");
  return {
    mode: hasContent ? delayed ? "degraded" : "live" : "demo",
    updatedAt: store.updatedAt,
    sourceCount: store.sourceCount,
    eventCount: store.events.length,
    informationCount: store.information.length,
    projectCount: store.projects.length,
    quarantinedCount: store.quarantine.length,
    publicationVersion: store.publicationVersion,
  };
}

export async function getStoredContent() {
  const store = await readStore();
  return {
    events: store.events,
    information: store.information,
    projects: store.projects,
    quarantine: store.quarantine,
    batches: store.batches,
    sourceSnapshots: store.sourceSnapshots,
    sourceReports: store.sourceReports,
    state: contentState(store),
  };
}

export async function replaceStoredContent(input: {
  events: EventRecord[];
  information: InformationItem[];
  projects: TrendProject[];
  quarantine?: QuarantinedContent[];
  receipt?: BatchReceipt;
  sourceCount: number;
  updatedAt?: string;
  snapshot?: {
    contentGroup: ContentSnapshotGroup;
    runId: string;
    collectedAt: string;
    sources: Array<{ sourceId: string; items: InformationItem[] }>;
    reports: ContentSourceReport[];
    activeSourceIds?: string[];
  };
}) {
  return mutateStateDocument(contentDocument, (current) => {
    if (input.snapshot) {
      if (input.snapshot.activeSourceIds) {
        const activeSourceIds = new Set(input.snapshot.activeSourceIds);
        const legacyGroups = legacySnapshotGroups(current.information);
        current.information = current.information.filter((item) => (
          (item.contentGroup ?? item.sourceStream ?? "information") !== input.snapshot!.contentGroup
          || (Boolean(item.sourceChannelId) && activeSourceIds.has(item.sourceChannelId!))
        ));
        for (const sourceId of Object.keys(current.sourceSnapshots)) {
          const snapshotGroup = current.sourceSnapshots[sourceId].contentGroup ?? legacyGroups.get(sourceId);
          if (!current.sourceSnapshots[sourceId].contentGroup && snapshotGroup) {
            current.sourceSnapshots[sourceId].contentGroup = snapshotGroup;
          }
          if (
            snapshotGroup === input.snapshot.contentGroup
            && !activeSourceIds.has(sourceId)
          ) delete current.sourceSnapshots[sourceId];
        }
        for (const sourceId of Object.keys(current.sourceReports)) {
          const reportGroup = current.sourceReports[sourceId].contentGroup
            ?? current.sourceSnapshots[sourceId]?.contentGroup
            ?? legacyGroups.get(sourceId);
          if (!current.sourceReports[sourceId].contentGroup && reportGroup) {
            current.sourceReports[sourceId].contentGroup = reportGroup;
          }
          if (
            reportGroup === input.snapshot.contentGroup
            && !activeSourceIds.has(sourceId)
          ) delete current.sourceReports[sourceId];
        }
      }
      for (const report of input.snapshot.reports) {
        const previous = current.sourceReports[report.sourceId];
        current.sourceReports[report.sourceId] = mergeContentSourceReport(previous, {
          ...report,
          contentGroup: input.snapshot.contentGroup,
        });
      }
      for (const source of input.snapshot.sources) {
        const previous = current.sourceSnapshots[source.sourceId];
        if (previous && Date.parse(input.snapshot.collectedAt) < Date.parse(previous.collectedAt)) continue;
        const sameRun = previous?.runId === input.snapshot.runId;
        const retained = current.information.filter((item) => item.sourceChannelId !== source.sourceId);
        const priorSameRun = sameRun
          ? current.information.filter((item) => item.sourceChannelId === source.sourceId)
          : [];
        current.information = deduplicateInformation([...source.items, ...priorSameRun, ...retained]);
        current.sourceSnapshots[source.sourceId] = {
          runId: input.snapshot.runId,
          collectedAt: input.snapshot.collectedAt,
          contentGroup: input.snapshot.contentGroup,
        };
      }
      const successfulTimes = Object.values(current.sourceSnapshots).map((snapshot) => snapshot.collectedAt);
      current.updatedAt = successfulTimes.sort().at(-1) ?? current.updatedAt;
      current.sourceCount = Object.keys(current.sourceSnapshots).length;
    } else {
      current.updatedAt = input.updatedAt ?? new Date().toISOString();
      current.sourceCount = input.sourceCount;
      current.information = deduplicateInformation(input.information);
    }
    current.publicationVersion += 1;
    current.events = mergeEventLedger(current.events, input.events);
    current.projects = input.projects;
    current.quarantine = [...current.quarantine, ...(input.quarantine ?? [])].slice(-500);
    current.batches = input.receipt ? [...current.batches, input.receipt].slice(-500) : current.batches;
    return {
      state: contentState(current),
      events: current.events,
      information: current.information,
      projects: current.projects,
      quarantine: current.quarantine,
      batches: current.batches,
      sourceSnapshots: current.sourceSnapshots,
      sourceReports: current.sourceReports,
    };
  });
}
