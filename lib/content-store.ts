import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ContentState, EventRecord, TrendProject } from "./types";

type ContentStore = {
  version: 1;
  updatedAt: string | null;
  sourceCount: number;
  events: EventRecord[];
  projects: TrendProject[];
};

const storePath = path.join(process.cwd(), "data", "content-store.json");
let writeChain: Promise<void> = Promise.resolve();

function emptyStore(): ContentStore {
  return { version: 1, updatedAt: null, sourceCount: 0, events: [], projects: [] };
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
  const store = JSON.parse(await readFile(storePath, "utf8")) as ContentStore;
  if (
    store.version !== 1 ||
    (store.updatedAt !== null && typeof store.updatedAt !== "string") ||
    typeof store.sourceCount !== "number" ||
    !Array.isArray(store.events) ||
    !Array.isArray(store.projects)
  ) {
    throw new Error("信息流内容库格式无效。");
  }
  return store;
}

function contentState(store: ContentStore): ContentState {
  return {
    mode: store.updatedAt && (store.events.length > 0 || store.projects.length > 0) ? "live" : "demo",
    updatedAt: store.updatedAt,
    sourceCount: store.sourceCount,
    eventCount: store.events.length,
    projectCount: store.projects.length,
  };
}

export async function getStoredContent() {
  const store = await readStore();
  return { events: store.events, projects: store.projects, state: contentState(store) };
}

export async function replaceStoredContent(input: {
  events: EventRecord[];
  projects: TrendProject[];
  sourceCount: number;
  updatedAt?: string;
}) {
  const operation = writeChain.then(async () => {
    const next: ContentStore = {
      version: 1,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
      sourceCount: input.sourceCount,
      events: input.events,
      projects: input.projects,
    };
    await ensureStore();
    await writeFile(storePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return { state: contentState(next), events: next.events, projects: next.projects };
  });
  writeChain = operation.then(() => undefined, () => undefined);
  return operation;
}
