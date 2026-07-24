import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
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

const dataRoot = process.env.VAULT2077_DATA_DIR
  ? path.resolve(process.env.VAULT2077_DATA_DIR)
  : path.join(process.cwd(), "data");
const storePath = path.join(dataRoot, "content-store.json");
let writeChain: Promise<void> = Promise.resolve();

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

async function ensureStore() {
  await mkdir(path.dirname(storePath), { recursive: true });
  try {
    await readFile(storePath, "utf8");
  } catch {
    await writeFile(storePath, `${JSON.stringify(emptyStore(), null, 2)}\n`, "utf8");
  }
}

async function readStore(): Promise<ContentStore> {
  await ensureStore();
  const parsed = JSON.parse(await readFile(storePath, "utf8")) as ContentStore | LegacyContentStore;
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
  return store;
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
  const operation = writeChain.then(async () => {
    const current = await readStore();
    const next: ContentStore = {
      version: 2,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
      sourceCount: input.sourceCount,
      publicationVersion: current.publicationVersion + 1,
      events: input.events,
      information: input.information,
      projects: input.projects,
      quarantine: [...current.quarantine, ...(input.quarantine ?? [])].slice(-500),
      batches: input.receipt ? [...current.batches, input.receipt].slice(-500) : current.batches,
    };
    await ensureStore();
    const temporaryPath = `${storePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", flag: "w" });
    await rename(temporaryPath, storePath);
    return {
      state: contentState(next),
      events: next.events,
      information: next.information,
      projects: next.projects,
      quarantine: next.quarantine,
      batches: next.batches,
    };
  });
  writeChain = operation.then(() => undefined, () => undefined);
  return operation;
}
