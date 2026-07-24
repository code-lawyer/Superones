import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SicContentItem, SicContentState, SicSourceCollectionReport } from "./sic-content-types.ts";

type SicContentStore = {
  version: 1;
  updatedAt: string | null;
  items: SicContentItem[];
  reports: SicSourceCollectionReport[];
};

const dataRoot = process.env.VAULT2077_DATA_DIR
  ? path.resolve(process.env.VAULT2077_DATA_DIR)
  : path.join(process.cwd(), "data");
const storePath = path.join(dataRoot, "sic-content-store.json");
let writeChain: Promise<void> = Promise.resolve();

function emptyStore(): SicContentStore {
  return { version: 1, updatedAt: null, items: [], reports: [] };
}

async function readStore(): Promise<SicContentStore> {
  await mkdir(dataRoot, { recursive: true });
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf8")) as SicContentStore;
    if (parsed.version !== 1 || !Array.isArray(parsed.items) || !Array.isArray(parsed.reports)) throw new Error("invalid store");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("SiC 内容库格式无效。");
    const store = emptyStore();
    await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    return store;
  }
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

export async function mergeSicStoredContent(input: { items: SicContentItem[]; reports: SicSourceCollectionReport[]; updatedAt?: string }) {
  const operation = writeChain.then(async () => {
    const current = await readStore();
    const currentById = new Map(current.items.map((item) => [item.id, item]));
    const successful = new Set(input.reports
      .filter((report) => report.status === "success" || report.status === "partial")
      .map((report) => report.sourceId));
    const merged = new Map<string, SicContentItem>();
    for (const item of current.items) {
      if (!successful.has(item.sourceId)) merged.set(item.id, item);
    }
    for (const item of input.items) {
      const previous = currentById.get(item.id);
      merged.set(item.id, {
        ...item,
        translatedTitle: item.translatedTitle ?? previous?.translatedTitle,
        description: item.description ?? previous?.description,
        contentSummary: item.contentSummary ?? previous?.contentSummary,
      });
    }
    const items = [...merged.values()]
      .sort((left, right) => Date.parse(right.publishedAt ?? right.collectedAt) - Date.parse(left.publishedAt ?? left.collectedAt))
      .slice(0, 2_000);
    const next: SicContentStore = {
      version: 1,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
      items,
      reports: input.reports,
    };
    const temporaryPath = `${storePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporaryPath, storePath);
    return { items: next.items, reports: next.reports, state: state(next) };
  });
  writeChain = operation.then(() => undefined, () => undefined);
  return operation;
}
