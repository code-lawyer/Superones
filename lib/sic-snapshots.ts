import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchJsonBounded } from "./sic-fetch.ts";
import type { SicBoardItem } from "./sic.ts";

export type HuggingFaceModelSnapshot = { id: string; name: string; downloadsAllTime: number };
export type OpenRouterModelSnapshot = { id: string; name: string };
type HuggingFaceProviderSnapshot = { capturedAt: string; models: HuggingFaceModelSnapshot[] };
type OpenRouterProviderSnapshot = { capturedAt: string; models: OpenRouterModelSnapshot[] };

type SicSnapshot = {
  capturedAt: string;
  huggingFace: HuggingFaceProviderSnapshot | null;
  openRouter: OpenRouterProviderSnapshot | null;
};

type SicSnapshotStore = { version: 2; snapshots: SicSnapshot[] };
type LegacySicSnapshot = {
  capturedAt: string;
  huggingFace?: HuggingFaceModelSnapshot[];
  openRouter?: OpenRouterModelSnapshot[];
};

const dataRoot = process.env.VAULT2077_DATA_DIR
  ? path.resolve(process.env.VAULT2077_DATA_DIR)
  : path.join(process.cwd(), "data");
const storePath = path.join(dataRoot, "sic-snapshots.json");
const MAX_PROVIDER_AGE_MS = 36 * 60 * 60 * 1000;
let writeChain: Promise<void> = Promise.resolve();

function emptyStore(): SicSnapshotStore {
  return { version: 2, snapshots: [] };
}

function migrateLegacyStore(value: { version?: number; snapshots?: LegacySicSnapshot[] }) {
  if (value.version !== 1 || !Array.isArray(value.snapshots)) return null;
  return {
    version: 2 as const,
    snapshots: value.snapshots.map((snapshot) => ({
      capturedAt: snapshot.capturedAt,
      huggingFace: snapshot.huggingFace?.length
        ? { capturedAt: snapshot.capturedAt, models: snapshot.huggingFace }
        : null,
      openRouter: snapshot.openRouter?.length
        ? { capturedAt: snapshot.capturedAt, models: snapshot.openRouter }
        : null,
    })),
  };
}

async function readStore(): Promise<SicSnapshotStore> {
  await mkdir(dataRoot, { recursive: true });
  try {
    const value = JSON.parse(await readFile(storePath, "utf8")) as SicSnapshotStore | {
      version?: number;
      snapshots?: LegacySicSnapshot[];
    };
    if (value.version === 2 && Array.isArray(value.snapshots)) return value as SicSnapshotStore;
    const migrated = migrateLegacyStore(value as { version?: number; snapshots?: LegacySicSnapshot[] });
    if (migrated) return migrated;
    throw new Error("SiC 快照格式无效。");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw new Error("SiC 快照格式无效。");
  }
}

async function writeStore(store: SicSnapshotStore) {
  await mkdir(dataRoot, { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(temporaryPath, storePath);
}

function referenceSnapshot<T extends { capturedAt: string }>(snapshots: T[], current: T) {
  const target = new Date(new Date(current.capturedAt).getTime() - 7 * 24 * 60 * 60 * 1000);
  const earliest = new Date(target.getTime() - 24 * 60 * 60 * 1000);
  const latest = new Date(target.getTime() + 24 * 60 * 60 * 1000);
  return snapshots
    .filter((snapshot) => {
      const time = new Date(snapshot.capturedAt);
      return time >= earliest && time <= latest;
    })
    .sort((a, b) => (
      Math.abs(new Date(a.capturedAt).getTime() - target.getTime())
      - Math.abs(new Date(b.capturedAt).getTime() - target.getTime())
    ))[0];
}

function isFresh(timestamp: string) {
  const age = Date.now() - new Date(timestamp).getTime();
  return Number.isFinite(age) && age >= 0 && age <= MAX_PROVIDER_AGE_MS;
}

export function weeklyHuggingFaceGrowth(
  current: HuggingFaceModelSnapshot[],
  reference: HuggingFaceModelSnapshot[],
): SicBoardItem[] {
  const prior = new Map(reference.map((model) => [model.id, model.downloadsAllTime]));
  return current
    .flatMap((model) => {
      const before = prior.get(model.id);
      const address = `https://huggingface.co/${model.name}`;
      return before === undefined
        ? []
        : [{
          id: model.id,
          name: model.name,
          value: Math.max(0, model.downloadsAllTime - before),
          href: address,
          address,
        }];
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 20);
}

export async function getModelSnapshotBoards() {
  const store = await readStore();
  const huggingFaceHistory = store.snapshots.flatMap((snapshot) => snapshot.huggingFace ? [snapshot.huggingFace] : []);
  const openRouterHistory = store.snapshots.flatMap((snapshot) => snapshot.openRouter ? [snapshot.openRouter] : []);
  const currentHuggingFace = huggingFaceHistory.at(-1);
  const currentOpenRouter = openRouterHistory.at(-1);
  const reference = currentHuggingFace
    ? referenceSnapshot(huggingFaceHistory.slice(0, -1), currentHuggingFace)
    : undefined;
  const huggingFaceFresh = Boolean(currentHuggingFace && isFresh(currentHuggingFace.capturedAt));
  const openRouterFresh = Boolean(currentOpenRouter && isFresh(currentOpenRouter.capturedAt));
  const huggingFace = huggingFaceFresh && currentHuggingFace && reference
    ? weeklyHuggingFaceGrowth(currentHuggingFace.models, reference.models)
    : [];
  const openRouter = openRouterFresh
    ? (currentOpenRouter?.models ?? []).slice(0, 20).map((model) => {
      const address = `https://openrouter.ai/${model.id}`;
      return { id: model.id, name: model.name, value: null, href: address, address };
    })
    : [];
  return { huggingFace, openRouter, huggingFaceReady: huggingFaceFresh && Boolean(reference) };
}

async function fetchHuggingFaceSnapshot(capturedAt: string): Promise<HuggingFaceProviderSnapshot> {
  const { data: payload } = await fetchJsonBounded<Array<{
    _id?: string;
    id?: string;
    downloadsAllTime?: number;
  }>>(
    "https://huggingface.co/api/models?sort=downloads&direction=-1&limit=1000&expand[]=downloadsAllTime",
    { headers: { Accept: "application/json" } },
    { maxBytes: 16 * 1024 * 1024 },
  );
  const models = payload.flatMap((model) => (
    model._id && model.id && Number.isFinite(model.downloadsAllTime)
      ? [{ id: model._id, name: model.id, downloadsAllTime: Number(model.downloadsAllTime) }]
      : []
  ));
  if (models.length === 0) throw new Error("Hugging Face 官方接口未返回可用快照。");
  return { capturedAt, models };
}

async function fetchOpenRouterSnapshot(capturedAt: string): Promise<OpenRouterProviderSnapshot> {
  const { data: payload } = await fetchJsonBounded<{ data?: Array<{ id?: string; name?: string }> }>(
    "https://openrouter.ai/api/v1/models?sort=top-weekly",
    { headers: { Accept: "application/json" } },
  );
  const models = (payload.data ?? []).flatMap((model) => (
    model.id ? [{ id: model.id, name: model.name ?? model.id }] : []
  ));
  if (models.length === 0) throw new Error("OpenRouter 官方接口未返回可用快照。");
  return { capturedAt, models };
}

export async function persistOfficialSicSnapshot(input: {
  capturedAt: string;
  huggingFace?: HuggingFaceModelSnapshot[];
  openRouter?: OpenRouterModelSnapshot[];
}) {
  const capturedAt = new Date(input.capturedAt).toISOString();
  const snapshot: SicSnapshot = {
    capturedAt,
    huggingFace: input.huggingFace?.length
      ? { capturedAt, models: input.huggingFace }
      : null,
    openRouter: input.openRouter?.length
      ? { capturedAt, models: input.openRouter }
      : null,
  };
  if (!snapshot.huggingFace && !snapshot.openRouter) throw new Error("模型榜单快照不能为空。");

  const operation = writeChain.then(async () => {
    const current = await readStore();
    const day = capturedAt.slice(0, 10);
    const existing = current.snapshots.find((item) => item.capturedAt.slice(0, 10) === day);
    const merged: SicSnapshot = {
      capturedAt,
      huggingFace: snapshot.huggingFace ?? existing?.huggingFace ?? null,
      openRouter: snapshot.openRouter ?? existing?.openRouter ?? null,
    };
    const history = current.snapshots.filter((item) => item.capturedAt.slice(0, 10) !== day);
    await writeStore({ version: 2, snapshots: [...history, merged].slice(-31) });
    return {
      capturedAt,
      huggingFace: snapshot.huggingFace?.models.length ?? 0,
      openRouter: snapshot.openRouter?.models.length ?? 0,
    };
  });
  writeChain = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function refreshOfficialSicSnapshots() {
  const capturedAt = new Date().toISOString();
  const [huggingFace, openRouter] = await Promise.allSettled([
    fetchHuggingFaceSnapshot(capturedAt),
    fetchOpenRouterSnapshot(capturedAt),
  ]);
  if (huggingFace.status === "rejected" && openRouter.status === "rejected") {
    throw new Error("Hugging Face 与 OpenRouter 上游均不可用。");
  }
  await persistOfficialSicSnapshot({
    capturedAt,
    huggingFace: huggingFace.status === "fulfilled" ? huggingFace.value.models : undefined,
    openRouter: openRouter.status === "fulfilled" ? openRouter.value.models : undefined,
  });
  return {
    capturedAt,
    huggingFace: huggingFace.status === "fulfilled"
      ? { count: huggingFace.value.models.length }
      : { error: huggingFace.reason instanceof Error ? huggingFace.reason.message : "Hugging Face 快照失败。" },
    openRouter: openRouter.status === "fulfilled"
      ? { count: openRouter.value.models.length }
      : { error: openRouter.reason instanceof Error ? openRouter.reason.message : "OpenRouter 快照失败。" },
  };
}
