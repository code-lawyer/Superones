import "server-only";

import {
  mutateStateDocument,
  readStateDocument,
  withPersistenceTransaction,
  type StateDocumentDefinition,
} from "./state-document-store.ts";
import {
  sicContentIdentityKey,
  sicContentProjectionDigest,
} from "./sic-content-identity.ts";
import {
  normalizedSicPublicationStatus,
  readNormalizedSicPublications,
  syncNormalizedSicPublications,
} from "./sic-publication-store.ts";
import type { SicContentItem, SicContentState, SicSourceCollectionReport } from "./sic-content-types.ts";

export type SicBootstrapState = {
  runId: string | null;
  completedSourceIds: string[];
  lastBootstrapAt: string | null;
  lastRunMode: "bootstrap" | "incremental" | null;
};

export type SicContentStore = {
  version: 3;
  updatedAt: string | null;
  items: SicContentItem[];
  reports: SicSourceCollectionReport[];
  sourceSnapshots: Record<string, { snapshotId: string; collectedAt: string }>;
  bootstrap: SicBootstrapState;
};

function emptyStore(): SicContentStore {
  return {
    version: 3,
    updatedAt: null,
    items: [],
    reports: [],
    sourceSnapshots: {},
    bootstrap: { runId: null, completedSourceIds: [], lastBootstrapAt: null, lastRunMode: null },
  };
}

function parseStore(value: unknown): SicContentStore {
  const parsed = value as Partial<SicContentStore> & { version?: number; items?: SicContentItem[] };
  if (![1, 2, 3].includes(parsed.version ?? 0) || !Array.isArray(parsed.items) || !Array.isArray(parsed.reports)) {
    throw new Error("SiC 内容库格式无效。");
  }
  // Legacy stores contain published items but no proof that they came from a
  // complete bootstrap run. Migrate fail-closed and let only an explicitly
  // labelled bootstrap batch establish per-source coverage.
  const completedSourceIds = parsed.bootstrap?.completedSourceIds ?? [];
  return {
    version: 3,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    items: parsed.items,
    reports: parsed.reports,
    sourceSnapshots: parsed.sourceSnapshots ?? {},
    bootstrap: {
      runId: parsed.bootstrap?.runId ?? null,
      completedSourceIds: [...new Set(completedSourceIds)].sort(),
      lastBootstrapAt: parsed.bootstrap?.lastBootstrapAt ?? null,
      lastRunMode: parsed.bootstrap?.lastRunMode ?? null,
    },
  };
}

const sicDocument: StateDocumentDefinition<SicContentStore> = {
  namespace: "sic-content",
  fileName: "sic-content-store.json",
  create: emptyStore,
  parse: parseStore,
};

async function readStore() {
  return readStateDocument(sicDocument);
}

function state(store: SicContentStore): SicContentState {
  return {
    updatedAt: store.updatedAt,
    itemCount: store.items.length,
    sourceCount: new Set(store.items.map((item) => item.sourceId)).size,
  };
}

export async function getSicStoredContent() {
  const store = await readStore();
  const normalized = await readNormalizedSicPublications(store.items);
  const selected = normalized ? { ...store, items: normalized } : store;
  return { items: selected.items, reports: store.reports, state: state(selected), bootstrap: store.bootstrap };
}

export { sicContentIdentityKey } from "./sic-content-identity.ts";

export function mergeSicContentItems(
  current: SicContentItem[],
  incoming: SicContentItem[],
  options: { replaceSourceIds?: Set<string> } = {},
) {
  const retained = current.filter((item) => !options.replaceSourceIds?.has(item.sourceId));
  const currentByIdentity = new Map(current.map((item) => [sicContentIdentityKey(item), item]));
  const retainedByIdentity = new Map(retained.map((item) => [sicContentIdentityKey(item), item]));
  const merged = new Map(retainedByIdentity);
  for (const item of incoming) {
    const identity = sicContentIdentityKey(item);
    const previous = currentByIdentity.get(identity);
    merged.set(identity, {
      ...item,
      translatedTitle: item.translatedTitle ?? previous?.translatedTitle,
      description: item.description ?? previous?.description,
      contentSummary: item.contentSummary ?? previous?.contentSummary,
      editorialLocale: item.editorialLocale ?? previous?.editorialLocale,
      editorialVersion: item.editorialVersion ?? previous?.editorialVersion,
    });
  }
  return [...merged.values()]
    .sort((left, right) => Date.parse(right.publishedAt ?? right.collectedAt) - Date.parse(left.publishedAt ?? left.collectedAt))
    .slice(0, 2_000);
}

export function retiredSicContentIdentityKeys(
  previous: SicContentItem[],
  next: SicContentItem[],
) {
  const nextIdentities = new Set(next.map((item) => sicContentIdentityKey(item)));
  return previous
    .map((item) => sicContentIdentityKey(item))
    .filter((identity) => !nextIdentities.has(identity))
    .sort();
}

export function mergeSicSourceReports(
  current: SicSourceCollectionReport[],
  incoming: SicSourceCollectionReport[],
) {
  const merged = new Map(current.map((report) => [report.sourceId, report]));
  for (const report of incoming) {
    const previous = merged.get(report.sourceId);
    if (!previous || Date.parse(report.collectedAt) > Date.parse(previous.collectedAt)) {
      merged.set(report.sourceId, report);
      continue;
    }
    if (Date.parse(report.collectedAt) < Date.parse(previous.collectedAt)) continue;
    const status = previous.status === "partial" || report.status === "partial"
      ? "partial"
      : previous.status === "failure" && report.status === "failure"
        ? "failure"
        : previous.status === "failure" || report.status === "failure"
          ? "partial"
          : previous.status === "success" || report.status === "success"
            ? "success"
            : "empty";
    const error = [...new Set([previous.error, report.error].filter(Boolean))].join("；");
    merged.set(report.sourceId, {
      ...report,
      status,
      itemCount: previous.itemCount + report.itemCount,
      ...(error ? { error } : {}),
    });
  }
  return [...merged.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

export async function mergeSicStoredContent(input: {
  items: SicContentItem[];
  reports: SicSourceCollectionReport[];
  updatedAt?: string;
  snapshotId?: string;
  activeSourceIds?: string[];
  runMode?: "bootstrap" | "incremental";
}) {
  return withPersistenceTransaction(async () => {
    const merged = await mutateStateDocument(sicDocument, (current) => {
      const previousItems = [...current.items];
      const previousProjectionDigest = sicContentProjectionDigest(current.items);
      const collectedAt = input.updatedAt ?? new Date().toISOString();
      const snapshotId = input.snapshotId ?? collectedAt;
      const retiredSourceIds: string[] = [];
      if (input.activeSourceIds) {
        const activeSourceIds = new Set(input.activeSourceIds);
        retiredSourceIds.push(...new Set(current.items
          .map((item) => item.sourceId)
          .filter((sourceId) => !activeSourceIds.has(sourceId))));
        current.items = current.items.filter((item) => activeSourceIds.has(item.sourceId));
        current.reports = current.reports.filter((report) => activeSourceIds.has(report.sourceId));
        for (const sourceId of Object.keys(current.sourceSnapshots)) {
          if (!activeSourceIds.has(sourceId)) delete current.sourceSnapshots[sourceId];
        }
        current.bootstrap.completedSourceIds = current.bootstrap.completedSourceIds.filter((sourceId) => activeSourceIds.has(sourceId));
      }
      const incomingBySource = new Map<string, SicContentItem[]>();
      for (const item of input.items) {
        const values = incomingBySource.get(item.sourceId) ?? [];
        values.push(item);
        incomingBySource.set(item.sourceId, values);
      }
      const replaceSourceIds = new Set<string>();
      const effectiveIncoming: SicContentItem[] = [];
      for (const report of input.reports) {
        if (report.status === "failure" || report.status === "empty") continue;
        const previous = current.sourceSnapshots[report.sourceId];
        if (previous && Date.parse(collectedAt) < Date.parse(previous.collectedAt)) continue;
        const incoming = incomingBySource.get(report.sourceId) ?? [];
        if (report.itemCount > 0 && incoming.length === 0) continue;
        if (report.status === "success") replaceSourceIds.add(report.sourceId);
        if (previous?.snapshotId === snapshotId) {
          effectiveIncoming.push(...current.items.filter((item) => item.sourceId === report.sourceId));
        }
        effectiveIncoming.push(...incoming);
        current.sourceSnapshots[report.sourceId] = { snapshotId, collectedAt };
      }
      current.items = mergeSicContentItems(current.items, effectiveIncoming, { replaceSourceIds });
      const changedIdentities = new Set(effectiveIncoming.map((item) => sicContentIdentityKey(item)));
      const changedItems = current.items.filter((item) => changedIdentities.has(sicContentIdentityKey(item)));
      current.updatedAt = Object.values(current.sourceSnapshots)
        .map((snapshot) => snapshot.collectedAt)
        .sort()
        .at(-1) ?? current.updatedAt;
      current.reports = mergeSicSourceReports(current.reports, input.reports);
      if (input.runMode) current.bootstrap.lastRunMode = input.runMode;
      if (input.runMode === "bootstrap") {
        if (current.bootstrap.runId !== snapshotId) {
          current.bootstrap.runId = snapshotId;
          current.bootstrap.completedSourceIds = [];
          current.bootstrap.lastBootstrapAt = null;
        }
        const completed = new Set(current.bootstrap.completedSourceIds);
        for (const report of input.reports) {
          const mergedReport = current.reports.find((candidate) => candidate.sourceId === report.sourceId);
          if (mergedReport?.status === "success" && current.items.some((item) => item.sourceId === report.sourceId)) {
            completed.add(report.sourceId);
          } else {
            completed.delete(report.sourceId);
          }
        }
        current.bootstrap.completedSourceIds = [...completed].sort();
        const expectedSourceIds = input.activeSourceIds ?? [];
        current.bootstrap.lastBootstrapAt = expectedSourceIds.length > 0
          && expectedSourceIds.every((sourceId) => completed.has(sourceId))
          ? collectedAt
          : null;
      }
      return {
        result: { items: current.items, reports: current.reports, state: state(current), bootstrap: current.bootstrap },
        sourceSnapshots: current.sourceSnapshots,
        previousProjectionDigest,
        changedItems,
        retiredIdentityKeys: retiredSicContentIdentityKeys(previousItems, current.items),
        authoritativeSourceIds: [...replaceSourceIds],
        retiredSourceIds,
      };
    });
    await syncNormalizedSicPublications({
      items: merged.result.items,
      sourceSnapshots: merged.sourceSnapshots,
      previousProjectionDigest: merged.previousProjectionDigest,
      changedItems: merged.changedItems,
      retiredIdentityKeys: merged.retiredIdentityKeys,
      authoritativeSourceIds: merged.authoritativeSourceIds,
      retiredSourceIds: merged.retiredSourceIds,
    });
    return merged.result;
  });
}

export async function initializeNormalizedSicPublications() {
  return withPersistenceTransaction(async () => {
    const store = await readStore();
    await syncNormalizedSicPublications({
      items: store.items,
      sourceSnapshots: store.sourceSnapshots,
      replaceAll: true,
    });
    return state(store);
  });
}

export async function getSicRecoveryProjection() {
  return readStore();
}

export async function getSicPublicationStorageStatus() {
  const store = await readStore();
  const storage = await normalizedSicPublicationStatus(store.items);
  const activeBySource = new Map<string, number>();
  for (const item of store.items) activeBySource.set(item.sourceId, (activeBySource.get(item.sourceId) ?? 0) + 1);
  return {
    ...storage,
    sources: store.reports.map((report) => ({
      sourceId: report.sourceId,
      latestStatus: report.status,
      latestAttemptAt: report.collectedAt,
      lastAcceptedAt: store.sourceSnapshots[report.sourceId]?.collectedAt ?? null,
      activeCount: activeBySource.get(report.sourceId) ?? 0,
    })),
  };
}

export async function replaceSicRecoveryProjection(input: {
  projection: SicContentStore;
  expectedCurrentDigest: string;
}) {
  const candidate = parseStore(input.projection);
  return withPersistenceTransaction(async () => {
    const replaced = await mutateStateDocument(sicDocument, (current) => {
      if (sicContentProjectionDigest(current.items) !== input.expectedCurrentDigest) {
        throw new Error("SiC 当前发布内容已在恢复期间变化；拒绝覆盖，请重新执行 dry-run。");
      }
      current.version = candidate.version;
      current.updatedAt = candidate.updatedAt;
      current.items = candidate.items;
      current.reports = candidate.reports;
      current.sourceSnapshots = candidate.sourceSnapshots;
      current.bootstrap = candidate.bootstrap;
      return state(current);
    });
    await syncNormalizedSicPublications({
      items: candidate.items,
      sourceSnapshots: candidate.sourceSnapshots,
      replaceAll: true,
    });
    return replaced;
  });
}
