import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildRankingAcquisitionBatches,
  buildSicAcquisitionBatches,
  buildVaultAcquisitionBatches,
  rankingGroup,
  type AcquisitionBuildContext,
  type AcquisitionSourceGroup,
} from "../lib/acquisition-batch-builder.ts";
import { validateContentBatch, type InboundContentBatch } from "../lib/content-contract.ts";
import type { AcquisitionBatch, JsonValue } from "../lib/acquisition-contract.ts";

const outputRoot = path.resolve(process.env.VAULT2077_COLLECTOR_OUTPUT_DIR || ".collector-output");
const vaultOutput = path.join(outputRoot, "legacy-vault");
const rankingData = path.join(outputRoot, "ranking-data");
const batchOutput = path.join(outputRoot, "acquisition-batches");
const sourceBundlePath = path.resolve(process.env.VAULT2077_SOURCE_BUNDLE_FILE || "config/source-bundle.json");
const sicRegistryPath = path.resolve("config/sic-source-registry.json");
const python = process.env.VAULT2077_PYTHON || (process.platform === "win32" ? "python" : "python3");

function run(command: string, args: string[], environment: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: environment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function readJson<T>(target: string) {
  return JSON.parse(await readFile(target, "utf8")) as T;
}

function withoutLegacyDeliveryEnvironment() {
  const {
    VAULT2077_DOMESTIC_INGEST_URL: _ingest,
    VAULT2077_DOMESTIC_PROCESS_URL: _process,
    VAULT2077_PIPELINE_SHARED_SECRET: _secret,
    ...environment
  } = process.env;
  return {
    ...environment,
    VAULT2077_SOURCE_BUNDLE_FILE: sourceBundlePath,
    VAULT2077_COLLECTOR_OUTPUT_DIR: vaultOutput,
    VAULT2077_TRIGGER_PROCESSING: "false",
  };
}

function compactTimestamp(value: string) {
  return value.replace(/[-:.]/g, "").replace("Z", "Z");
}

async function collectVault() {
  await mkdir(vaultOutput, { recursive: true });
  await run(python, ["-m", "collector.horizon_raw_export"], withoutLegacyDeliveryEnvironment());
  const files = (await readdir(vaultOutput))
    .filter((name) => name.endsWith(".json") && name !== "report.json")
    .sort();
  const packets = await Promise.all(files.map(async (name) => (
    validateContentBatch(await readJson<unknown>(path.join(vaultOutput, name)))
  )));
  const report = await readJson<{
    bundleRevision: string;
    collectedFrom: string;
    collectedUntil: string;
    generatedAt: string;
    outcomes: Array<{
      source_id?: string;
      sourceId?: string;
      status: string;
      error?: string | null;
    }>;
  }>(path.join(vaultOutput, "report.json"));
  return { packets, report };
}

function latest<T extends { capturedAt: string }>(values: T[] | undefined) {
  return [...(values ?? [])].sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt)).at(-1);
}

function jsonValues(values: unknown[]) {
  return values as JsonValue[];
}

async function collectRankings(context: AcquisitionBuildContext) {
  process.env.VAULT2077_DATA_DIR = rankingData;
  await mkdir(rankingData, { recursive: true });
  const [
    { refreshOfficialSicSnapshots },
    { refreshGithubRankingSnapshot },
    { refreshSicExtensionSnapshots },
  ] = await Promise.all([
    import("../lib/sic-snapshots.ts"),
    import("../lib/sic-github-rankings.ts"),
    import("../lib/sic-extensions.ts"),
  ]);
  const [models, github, extensions] = await Promise.allSettled([
    refreshOfficialSicSnapshots(),
    refreshGithubRankingSnapshot(),
    refreshSicExtensionSnapshots(),
  ]);

  const groups: AcquisitionSourceGroup[] = [];
  const modelStore = await readJson<{
    snapshots?: Array<{
      capturedAt: string;
      huggingFace?: { models?: unknown[] } | null;
      openRouter?: { models?: unknown[] } | null;
    }>;
  }>(path.join(rankingData, "sic-snapshots.json")).catch(() => ({ snapshots: [] }));
  const currentModels = latest<{
    capturedAt: string;
    huggingFace?: { models?: unknown[] } | null;
    openRouter?: { models?: unknown[] } | null;
  }>(modelStore.snapshots);
  const modelResult = models.status === "fulfilled" ? models.value : null;
  groups.push(rankingGroup({
    context,
    sourceId: "ranking:hugging-face",
    provider: "hugging_face",
    canonicalUrl: "https://huggingface.co/api/models",
    payload: currentModels?.huggingFace?.models?.length
      ? { provider: "hugging_face", items: jsonValues(currentModels.huggingFace.models) }
      : { provider: "hugging_face" },
    status: modelResult && !("error" in modelResult.huggingFace) ? "success" : "failure",
    error: modelResult && "error" in modelResult.huggingFace
      ? modelResult.huggingFace.error
      : models.status === "rejected" && models.reason instanceof Error
        ? models.reason.message
        : null,
  }));
  groups.push(rankingGroup({
    context,
    sourceId: "ranking:openrouter",
    provider: "openrouter",
    canonicalUrl: "https://openrouter.ai/api/v1/models?sort=top-weekly",
    payload: currentModels?.openRouter?.models?.length
      ? { provider: "openrouter", items: jsonValues(currentModels.openRouter.models) }
      : { provider: "openrouter" },
    status: modelResult && !("error" in modelResult.openRouter) ? "success" : "failure",
    error: modelResult && "error" in modelResult.openRouter
      ? modelResult.openRouter.error
      : models.status === "rejected" && models.reason instanceof Error
        ? models.reason.message
        : null,
  }));

  const githubStore = await readJson<{
    snapshots?: Array<{
      capturedAt: string;
      trending?: { items?: unknown[] } | null;
      daily?: { items?: unknown[] } | null;
      weekly?: { items?: unknown[] } | null;
    }>;
  }>(path.join(rankingData, "sic-github-rankings.json")).catch(() => ({ snapshots: [] }));
  const currentGithub = latest<{
    capturedAt: string;
    trending?: { items?: unknown[] } | null;
    daily?: { items?: unknown[] } | null;
    weekly?: { items?: unknown[] } | null;
  }>(githubStore.snapshots);
  const githubResult = github.status === "fulfilled" ? github.value : null;
  for (const board of [
    {
      key: "trending" as const,
      sourceId: "ranking:github-trending",
      provider: "github_trending",
      url: "https://github.com/trending",
    },
    {
      key: "daily" as const,
      sourceId: "ranking:github-24h",
      provider: "github_24h",
      url: "https://www.gharchive.org/",
    },
    {
      key: "weekly" as const,
      sourceId: "ranking:github-7d",
      provider: "github_7d",
      url: "https://www.gharchive.org/",
    },
  ]) {
    const result = githubResult?.[board.key];
    const items = currentGithub?.[board.key]?.items ?? [];
    groups.push(rankingGroup({
      context,
      sourceId: board.sourceId,
      provider: board.provider,
      canonicalUrl: board.url,
      payload: items.length ? { provider: board.provider, items: jsonValues(items) } : { provider: board.provider },
      status: result && !("error" in result) ? "success" : "failure",
      error: result && "error" in result
        ? result.error
        : github.status === "rejected" && github.reason instanceof Error
          ? github.reason.message
          : null,
    }));
  }

  const extensionStore = await readJson<{
    snapshots?: Array<{
      capturedAt: string;
      skills?: { selected?: unknown[]; totals?: unknown[] } | null;
      mcps?: { selected?: unknown[]; totals?: unknown[] } | null;
    }>;
  }>(path.join(rankingData, "sic-extension-snapshots.json")).catch(() => ({ snapshots: [] }));
  const currentExtensions = latest<{
    capturedAt: string;
    skills?: { selected?: unknown[]; totals?: unknown[] } | null;
    mcps?: { selected?: unknown[]; totals?: unknown[] } | null;
  }>(extensionStore.snapshots);
  const extensionResult = extensions.status === "fulfilled" ? extensions.value : null;
  for (const provider of [
    {
      key: "skills" as const,
      sourceId: "ranking:skills",
      url: "https://skills.sh/",
    },
    {
      key: "mcps" as const,
      sourceId: "ranking:mcps",
      url: "https://smithery.ai/",
    },
  ]) {
    const snapshot = currentExtensions?.[provider.key];
    const error = extensionResult?.errors[provider.key];
    groups.push(rankingGroup({
      context,
      sourceId: provider.sourceId,
      provider: provider.key,
      canonicalUrl: provider.url,
      payload: snapshot?.selected?.length || snapshot?.totals?.length
        ? {
          provider: provider.key,
          selected: jsonValues(snapshot.selected ?? []),
          totals: jsonValues(snapshot.totals ?? []),
        }
        : { provider: provider.key },
      status: error ? "failure" : snapshot ? "success" : "failure",
      error: error
        || (extensions.status === "rejected" && extensions.reason instanceof Error
          ? extensions.reason.message
          : null),
    }));
  }
  return groups;
}

async function sendBatch(url: string, secret: string, batch: AcquisitionBatch, rawPayload: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = createHash("sha256").update(rawPayload).digest("hex");
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${batch.batchId}.${bodyHash}`)
    .digest("base64url");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vault2077-batch-id": batch.batchId,
      "x-vault2077-timestamp": timestamp,
      "x-vault2077-signature": `sha256=${signature}`,
    },
    body: rawPayload,
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`统一接收返回 HTTP ${response.status}：${body.slice(0, 500)}`);
  return JSON.parse(body) as unknown;
}

await mkdir(outputRoot, { recursive: true });
await mkdir(batchOutput, { recursive: true });
const [sourceBundle, sicRegistry] = await Promise.all([
  readJson<{
    revision: string;
    sources: Array<{ id: string; connector: string }>;
  }>(sourceBundlePath),
  readJson<{
    version: number;
    sources: Array<{ id: string; kind: string }>;
  }>(sicRegistryPath),
]);
const vault = await collectVault();
const runId = `run:${process.env.GITHUB_RUN_ID || compactTimestamp(vault.report.generatedAt)}`;
const context: AcquisitionBuildContext = {
  runId,
  registryRevision: `registry:${sourceBundle.revision}:sic-v${sicRegistry.version}`,
  collectedFrom: vault.report.collectedFrom,
  collectedUntil: vault.report.collectedUntil,
  collectedAt: vault.report.generatedAt,
};
const { collectSicRawContent } = await import("../lib/sic-collector.ts");
const sicCollection = await collectSicRawContent(fetch, { allowAllFailed: true });
await writeFile(
  path.join(outputRoot, "sic-raw-collection.json"),
  `${JSON.stringify(sicCollection, null, 2)}\n`,
  "utf8",
);
const rankingGroups = await collectRankings(context);
const batches = [
  ...buildVaultAcquisitionBatches({
    context,
    packets: vault.packets,
    outcomes: vault.report.outcomes,
    connectorBySource: new Map(sourceBundle.sources.map((source) => [source.id, source.connector])),
  }),
  ...buildSicAcquisitionBatches({
    context,
    collection: sicCollection,
    adapterBySource: new Map(sicRegistry.sources.map((source) => [source.id, source.kind])),
  }),
  ...buildRankingAcquisitionBatches({ context, groups: rankingGroups }),
];

const ingestUrl = process.env.VAULT2077_DOMESTIC_ACQUISITION_URL;
const processUrl = process.env.VAULT2077_DOMESTIC_ACQUISITION_PROCESS_URL
  || (ingestUrl ? `${ingestUrl.replace(/\/$/, "")}/process` : undefined);
const secret = process.env.VAULT2077_PIPELINE_SHARED_SECRET;
const requireDelivery = process.env.VAULT2077_REQUIRE_DOMESTIC_DELIVERY === "true";
if (requireDelivery && (!ingestUrl || !secret)) {
  throw new Error("本次运行要求境内投递，但统一接收 URL 或共享密钥未配置。");
}
if ((ingestUrl && !secret) || (!ingestUrl && secret)) {
  throw new Error("统一接收 URL 与 VAULT2077_PIPELINE_SHARED_SECRET 必须同时配置。");
}

const files = [];
const receipts = [];
for (const batch of batches) {
  const rawPayload = JSON.stringify(batch);
  const filename = `${createHash("sha256").update(batch.batchId).digest("hex")}.json`;
  const target = path.join(batchOutput, filename);
  await writeFile(target, rawPayload, "utf8");
  files.push({ batchId: batch.batchId, file: target, bytes: Buffer.byteLength(rawPayload) });
  if (ingestUrl && secret) receipts.push(await sendBatch(ingestUrl, secret, batch, rawPayload));
}

let processing: unknown = null;
if (ingestUrl && secret && processUrl && process.env.VAULT2077_TRIGGER_PROCESSING !== "false") {
  const response = await fetch(processUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.VAULT2077_PIPELINE_WORKER_SECRET || secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ maxBatches: 50 }),
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  const body = await response.text();
  if (!response.ok && response.status !== 207) {
    throw new Error(`统一 Worker 返回 HTTP ${response.status}：${body.slice(0, 500)}`);
  }
  processing = JSON.parse(body) as unknown;
}

const sourceReports = batches.flatMap((batch) => batch.sourceReports);
const report = {
  runId,
  registryRevision: context.registryRevision,
  collectedFrom: context.collectedFrom,
  collectedUntil: context.collectedUntil,
  collectedAt: context.collectedAt,
  batches: batches.length,
  records: batches.reduce((sum, batch) => sum + batch.records.length, 0),
  sources: sourceReports.length,
  sourceStatus: Object.fromEntries(
    ["succeeded", "partial", "empty", "failed"].map((status) => [
      status,
      sourceReports.filter((item) => item.status === status).length,
    ]),
  ),
  files,
  receipts,
  processing,
};
await writeFile(path.join(outputRoot, "acquisition-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));
if (sourceReports.some((item) => item.status === "failed")) {
  console.error("一个或多个已批准来源抓取失败；请检查 acquisition-report.json。");
  process.exitCode = 1;
}
if (processing && typeof processing === "object" && "ok" in processing && processing.ok !== true) {
  console.error("境内 Worker 未完成全部批次；请检查 acquisition-report.json 的 processing 字段。");
  process.exitCode = 1;
}
