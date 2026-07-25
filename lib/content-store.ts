import "server-only";

import { mutateStateDocument, readStateDocument, type StateDocumentDefinition } from "./state-document-store.ts";
import type { BatchReceipt, ContentState, EventRecord, InformationItem, QuarantinedContent, TrendProject } from "./types.ts";

type ContentStore = {
  version: 2;
  updatedAt: string | null;
  sourceCount: number;
  publicationVersion: number;
  events: EventRecord[];
  information: InformationItem[];
  projects: TrendProject[];
  quarantine: QuarantinedContent[];
  batches: BatchReceipt[];
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
    version: 2,
    updatedAt: null,
    sourceCount: 0,
    publicationVersion: 0,
    events: [],
    information: [],
    projects: [],
    quarantine: [],
    batches: [],
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

function parseStore(value: unknown): ContentStore {
  const parsed = value as ContentStore | LegacyContentStore;
  const store: ContentStore = parsed.version === 1
    ? { ...emptyStore(), updatedAt: parsed.updatedAt, sourceCount: parsed.sourceCount, events: parsed.events, projects: parsed.projects }
    : parsed;
  if (
    store.version !== 2 ||
    (store.updatedAt !== null && typeof store.updatedAt !== "string") ||
    typeof store.sourceCount !== "number" ||
    typeof store.publicationVersion !== "number" ||
    !Array.isArray(store.events) ||
    !Array.isArray(store.information) ||
    !Array.isArray(store.projects) ||
    !Array.isArray(store.quarantine) ||
    !Array.isArray(store.batches)
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
  return {
    mode: store.updatedAt && (store.events.length > 0 || store.information.length > 0 || store.projects.length > 0) ? "live" : "demo",
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
}) {
  return mutateStateDocument(contentDocument, (current) => {
    current.updatedAt = input.updatedAt ?? new Date().toISOString();
    current.sourceCount = input.sourceCount;
    current.publicationVersion += 1;
    current.events = input.events;
    current.information = deduplicateInformation(input.information);
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
    };
  });
}
