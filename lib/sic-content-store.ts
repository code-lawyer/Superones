import "server-only";

import {
  mutateStateDocument,
  readStateDocument,
  type StateDocumentDefinition,
} from "./state-document-store.ts";
import type { SicContentItem, SicContentState, SicSourceCollectionReport } from "./sic-content-types.ts";

export type SicBootstrapState = {
  completedSourceIds: string[];
  lastBootstrapAt: string | null;
  lastRunMode: "bootstrap" | "incremental" | null;
};

type SicContentStore = {
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
    bootstrap: { completedSourceIds: [], lastBootstrapAt: null, lastRunMode: null },
  };
}

function parseStore(value: unknown): SicContentStore {
  const parsed = value as Partial<SicContentStore> & { version?: number; items?: SicContentItem[] };
  if (![1, 2, 3].includes(parsed.version ?? 0) || !Array.isArray(parsed.items) || !Array.isArray(parsed.reports)) {
    throw new Error("SiC 内容库格式无效。");
  }
  const completedSourceIds = parsed.bootstrap?.completedSourceIds
    ?? [...new Set(parsed.items.map((item) => item.sourceId))];
  return {
    version: 3,
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    items: parsed.items,
    reports: parsed.reports,
    sourceSnapshots: parsed.sourceSnapshots ?? {},
    bootstrap: {
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
  return { items: store.items, reports: store.reports, state: state(store), bootstrap: store.bootstrap };
}

export function sicContentIdentityKey(item: Pick<SicContentItem, "sourceId" | "canonicalId" | "url">) {
  if (item.canonicalId) return `${item.sourceId}:canonical:${item.canonicalId}`;
  try {
    const url = new URL(item.url);
    for (const key of [...url.searchParams.keys()]) {
      if (key === "hl" || key.startsWith("utm_")) url.searchParams.delete(key);
    }
    url.hash = "";
    return `${item.sourceId}:url:${url.toString()}`;
  } catch {
    return `${item.sourceId}:url:${item.url}`;
  }
}

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
  return mutateStateDocument(sicDocument, (current) => {
    const collectedAt = input.updatedAt ?? new Date().toISOString();
    const snapshotId = input.snapshotId ?? collectedAt;
    if (input.activeSourceIds) {
      const activeSourceIds = new Set(input.activeSourceIds);
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
      if (report.status === "failure") continue;
      const previous = current.sourceSnapshots[report.sourceId];
      if (previous && Date.parse(collectedAt) < Date.parse(previous.collectedAt)) continue;
      const incoming = incomingBySource.get(report.sourceId) ?? [];
      if (report.itemCount > 0 && incoming.length === 0) continue;
      replaceSourceIds.add(report.sourceId);
      if (previous?.snapshotId === snapshotId) {
        effectiveIncoming.push(...current.items.filter((item) => item.sourceId === report.sourceId));
      }
      effectiveIncoming.push(...incoming);
      current.sourceSnapshots[report.sourceId] = { snapshotId, collectedAt };
    }
    current.items = mergeSicContentItems(current.items, effectiveIncoming, { replaceSourceIds });
    current.updatedAt = Object.values(current.sourceSnapshots)
      .map((snapshot) => snapshot.collectedAt)
      .sort()
      .at(-1) ?? current.updatedAt;
    current.reports = mergeSicSourceReports(current.reports, input.reports);
    if (input.runMode) current.bootstrap.lastRunMode = input.runMode;
    if (input.runMode === "bootstrap") {
      current.bootstrap.lastBootstrapAt = collectedAt;
      const completed = new Set(current.bootstrap.completedSourceIds);
      for (const report of input.reports) {
        if (["success", "partial"].includes(report.status) && current.items.some((item) => item.sourceId === report.sourceId)) {
          completed.add(report.sourceId);
        }
      }
      current.bootstrap.completedSourceIds = [...completed].sort();
    }
    return { items: current.items, reports: current.reports, state: state(current), bootstrap: current.bootstrap };
  });
}
