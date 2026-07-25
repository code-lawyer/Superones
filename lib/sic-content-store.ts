import "server-only";

import { mutateStateDocument, readStateDocument, type StateDocumentDefinition } from "./state-document-store.ts";
import type { SicContentItem, SicContentState, SicSourceCollectionReport } from "./sic-content-types.ts";

type SicContentStore = {
  version: 1;
  updatedAt: string | null;
  items: SicContentItem[];
  reports: SicSourceCollectionReport[];
};

function emptyStore(): SicContentStore {
  return { version: 1, updatedAt: null, items: [], reports: [] };
}

function parseStore(value: unknown): SicContentStore {
  const parsed = value as SicContentStore;
  if (parsed.version !== 1 || !Array.isArray(parsed.items) || !Array.isArray(parsed.reports)) {
    throw new Error("SiC 内容库格式无效。");
  }
  return parsed;
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
  return { items: store.items, reports: store.reports, state: state(store) };
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
    });
  }
  return [...merged.values()]
    .sort((left, right) => Date.parse(right.publishedAt ?? right.collectedAt) - Date.parse(left.publishedAt ?? left.collectedAt))
    .slice(0, 2_000);
}

export async function mergeSicStoredContent(input: { items: SicContentItem[]; reports: SicSourceCollectionReport[]; updatedAt?: string }) {
  return mutateStateDocument(sicDocument, (current) => {
    const replaceSourceIds = new Set(input.reports
      .filter((report) => report.sourceId === "google-ml-courses" && report.status === "success")
      .map((report) => report.sourceId));
    const items = mergeSicContentItems(current.items, input.items, { replaceSourceIds });
    current.updatedAt = input.updatedAt ?? new Date().toISOString();
    current.items = items;
    current.reports = input.reports;
    return { items: current.items, reports: current.reports, state: state(current) };
  });
}
