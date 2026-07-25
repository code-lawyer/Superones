import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
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
import {
  ACQUISITION_LANES,
  ACQUISITION_RUN_MODES,
  type AcquisitionBatch,
  type AcquisitionLane,
  type AcquisitionRecord,
  type AcquisitionRunMode,
} from "../lib/acquisition-contract.ts";
import type { DirectRankingBoard } from "../lib/direct-rankings.ts";
import type { SicRawCollection } from "../lib/sic-collector.ts";

const outputRoot = path.resolve(process.env.VAULT2077_COLLECTOR_OUTPUT_DIR || ".collector-output");
const requestedLane = (process.env.VAULT2077_ACQUISITION_LANE || "information") === "statements"
  ? "roadside"
  : process.env.VAULT2077_ACQUISITION_LANE || "information";
if (!ACQUISITION_LANES.includes(requestedLane as AcquisitionLane)) {
  throw new Error(`未知采集通道：${requestedLane}。`);
}
const lane = requestedLane as AcquisitionLane;
const requestedRunMode = process.env.VAULT2077_ACQUISITION_RUN_MODE || "incremental";
if (!ACQUISITION_RUN_MODES.includes(requestedRunMode as AcquisitionRunMode)) {
  throw new Error(`未知采集运行模式：${requestedRunMode}。`);
}
const runMode = requestedRunMode as AcquisitionRunMode;
const vaultOutput = path.join(outputRoot, `legacy-vault-${lane}-${Date.now()}`);
const rankingData = path.join(outputRoot, "ranking-data");
const batchOutput = path.join(outputRoot, "acquisition-batches");
const sourceBundlePath = path.resolve(process.env.VAULT2077_SOURCE_BUNDLE_FILE || "config/source-bundle.json");
const sicRegistryPath = path.resolve("config/sic-source-registry.json");
const python = process.env.VAULT2077_PYTHON || (process.platform === "win32" ? "uv" : "python3");
const pythonPrefix = path.basename(python).toLowerCase().startsWith("uv")
  ? ["run", "--with-requirements", "collector/requirements.txt", "python"]
  : [];

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

function withoutLegacyDeliveryEnvironment(sourceIds: string[]) {
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
    VAULT2077_SOURCE_IDS: sourceIds.join(","),
  };
}

function compactTimestamp(value: string) {
  return value.replace(/[-:.]/g, "").replace("Z", "Z");
}

async function collectVault(sourceIds: string[]) {
  await mkdir(vaultOutput, { recursive: true });
  await run(python, [...pythonPrefix, "-m", "collector.horizon_raw_export"], withoutLegacyDeliveryEnvironment(sourceIds));
  const files = (await readdir(vaultOutput))
    .filter((name) => name.endsWith(".json") && !["report.json", "discovery-candidates.json"].includes(name))
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
      duration_ms?: number;
    }>;
  }>(path.join(vaultOutput, "report.json"));
  return { packets, report };
}

async function collectRankings(context: AcquisitionBuildContext) {
  process.env.VAULT2077_DATA_DIR = rankingData;
  await mkdir(rankingData, { recursive: true });
  const { refreshDirectRankings } = await import("../lib/direct-rankings.ts");
  const result = await refreshDirectRankings();
  const groups: AcquisitionSourceGroup[] = result.boards.map((board: DirectRankingBoard) => rankingGroup({
    context,
    sourceId: `ranking:${board.id}`,
    provider: board.provider,
    canonicalUrl: board.sourceUrl,
    payload: JSON.parse(JSON.stringify(board)),
    status: "success",
  }));
  for (const [key, error] of Object.entries(result.errors)) {
    groups.push(rankingGroup({
      context,
      sourceId: `ranking:${key}`,
      provider: key.split(":")[0],
      canonicalUrl: "https://example.invalid/ranking-failure",
      payload: { provider: key.split(":")[0] },
      status: "failure",
      error,
    }));
  }
  groups.push(...await collectFrontierFallbacks(context));
  return groups;
}

type FrontierFallbackTask = {
  taskId: string;
  season: string;
  submissionId: string;
  owner: string;
  repo: string;
  requestedAt: string;
};

async function collectFrontierFallbacks(context: AcquisitionBuildContext): Promise<AcquisitionSourceGroup[]> {
  const tasksUrl = process.env.VAULT2077_FRONTIER_PUBLIC_TASKS_URL;
  if (!tasksUrl) return [];
  const secret = process.env.VAULT2077_PIPELINE_WORKER_SECRET
    || process.env.VAULT2077_PIPELINE_SHARED_SECRET;
  if (!secret) throw new Error("已配置 Frontier 公开任务 URL，但缺少读取密钥。");
  const response = await fetch(tasksUrl, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Frontier 公开任务接口返回 HTTP ${response.status}。`);
  const payload = await response.json() as { tasks?: unknown };
  if (!Array.isArray(payload.tasks)) throw new Error("Frontier 公开任务接口响应格式无效。");
  const tasks = payload.tasks as FrontierFallbackTask[];
  const token = process.env.GITHUB_TOKEN;

  return Promise.all(tasks.map(async (task): Promise<AcquisitionSourceGroup> => {
    const sourceId = `frontier:${task.submissionId}`;
    const startedAt = new Date().toISOString();
    const canonicalUrl = `https://github.com/${encodeURIComponent(task.owner)}/${encodeURIComponent(task.repo)}`;
    try {
      if (
        !task
        || typeof task.taskId !== "string"
        || typeof task.season !== "string"
        || typeof task.submissionId !== "string"
        || !/^[A-Za-z0-9_.-]+$/.test(task.owner)
        || !/^[A-Za-z0-9_.-]+$/.test(task.repo)
      ) throw new Error("Frontier 公开任务字段无效。");
      const github = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(task.owner)}/${encodeURIComponent(task.repo)}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Vault2077-Frontier-Fallback/1.0",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!github.ok) throw new Error(`GitHub 返回 HTTP ${github.status}。`);
      const repository = await github.json() as { stargazers_count?: unknown; full_name?: unknown; private?: unknown };
      if (
        typeof repository.stargazers_count !== "number"
        || typeof repository.full_name !== "string"
        || repository.private === true
        || repository.full_name.toLowerCase() !== `${task.owner}/${task.repo}`.toLowerCase()
      ) throw new Error("GitHub 仓库响应与公开任务不匹配。");
      const record: AcquisitionRecord = {
        schemaVersion: 1,
        kind: "repository_observation",
        recordId: `repository:${createHash("sha256").update(task.taskId).digest("hex")}`,
        sourceId,
        externalId: task.taskId,
        canonicalUrl,
        observedAt: context.collectedAt,
        contentHash: createHash("sha256")
          .update(`${task.season}:${task.submissionId}:${repository.stargazers_count}`)
          .digest("hex"),
        payload: {
          target: "frontier",
          season: task.season,
          submissionId: task.submissionId,
          stars: repository.stargazers_count,
        },
      };
      return {
        report: {
          sourceId,
          adapter: "github-frontier-fallback",
          status: "succeeded",
          startedAt,
          completedAt: new Date().toISOString(),
          recordCount: 1,
        },
        records: [record],
      };
    } catch (error) {
      return {
        report: {
          sourceId,
          adapter: "github-frontier-fallback",
          status: "failed",
          startedAt,
          completedAt: new Date().toISOString(),
          recordCount: 0,
          errorCode: "FRONTIER_FALLBACK_FAILED",
          errorMessage: error instanceof Error ? error.message.slice(0, 1_000) : String(error).slice(0, 1_000),
        },
        records: [],
      };
    }
  }));
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

function postLongRunningJson(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const target = new URL(url);
    const request = (target.protocol === "https:" ? httpsRequest : httpRequest)({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: "POST",
      headers: {
        ...headers,
        "content-length": Buffer.byteLength(body),
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`境内 Worker 在 ${timeoutMs} ms 内没有完成。`));
    });
    request.on("error", reject);
    request.end(body);
  });
}

await mkdir(outputRoot, { recursive: true });
await mkdir(batchOutput, { recursive: true });
const [sourceBundle, sicRegistry] = await Promise.all([
  readJson<{
    revision: string;
    sources: Array<{
      id: string;
      name: string;
      connector: string;
      sourceStream?: "information" | "roadside" | "statements";
      contentGroup?: "information" | "roadside" | "documents";
      originPlatform?: "web" | "x";
    }>;
  }>(sourceBundlePath),
  readJson<{
    version: number;
    sources: Array<{
      id: string;
      name: string;
      group: string;
      kind: string;
    }>;
  }>(sicRegistryPath),
]);
const collectedAt = new Date().toISOString();
const lookbackHours = runMode === "bootstrap"
  ? lane === "information" || lane === "roadside"
    ? 30 * 24
    : 24
  : lane === "sic"
    ? 24
    : 12;
process.env.VAULT2077_COLLECTION_LOOKBACK_HOURS = String(lookbackHours);
const windowUntil = collectedAt;
const windowFrom = new Date(Date.parse(windowUntil) - lookbackHours * 60 * 60 * 1000).toISOString();
const scheduleId = process.env.VAULT2077_SCHEDULE_ID
  || `${lane}:${windowUntil.slice(0, 13).replace(/[-T]/g, "")}`;
const runId = `run:${process.env.GITHUB_RUN_ID || compactTimestamp(collectedAt)}:${lane}`;
const context: AcquisitionBuildContext = {
  runId,
  lane,
  runMode,
  scheduleId,
  windowFrom,
  windowUntil,
  registryRevision: `registry:${sourceBundle.revision}:sic-v${sicRegistry.version}`,
  collectedFrom: windowFrom,
  collectedUntil: windowUntil,
  collectedAt,
};
const acquisitionMaxRecords = Math.max(
  1,
  Number(process.env.VAULT2077_ACQUISITION_MAX_RECORDS ?? "200"),
);

let vault: Awaited<ReturnType<typeof collectVault>> | null = null;
let sicCollection: SicRawCollection | null = null;
let rankingGroups: AcquisitionSourceGroup[] = [];
let batches: AcquisitionBatch[] = [];

if (lane === "information" || lane === "roadside") {
  const sourceIds = sourceBundle.sources
    .filter((source) => (
      (source.contentGroup === "roadside" || ["roadside", "statements"].includes(source.sourceStream ?? ""))
        ? "roadside"
        : "information"
    ) === lane)
    .map((source) => source.id);
  vault = await collectVault(sourceIds);
  context.collectedFrom = vault.report.collectedFrom;
  context.collectedUntil = vault.report.collectedUntil;
  context.collectedAt = vault.report.generatedAt;
  context.windowFrom = vault.report.collectedFrom;
  context.windowUntil = vault.report.collectedUntil;
  batches = buildVaultAcquisitionBatches({
    context,
    packets: vault.packets,
    outcomes: vault.report.outcomes,
    connectorBySource: new Map(sourceBundle.sources.map((source) => [source.id, source.connector])),
    sourceStreamBySource: new Map(sourceBundle.sources.map((source) => [
      source.id,
      source.contentGroup === "roadside" || ["roadside", "statements"].includes(source.sourceStream ?? "")
        ? "roadside"
        : "information",
    ])),
    lane,
    maxRecords: acquisitionMaxRecords,
  });
} else if (lane === "sic") {
  const { collectSicRawContent } = await import("../lib/sic-collector.ts");
  sicCollection = await collectSicRawContent(fetch, { allowAllFailed: true, runMode });
  await writeFile(
    path.join(outputRoot, "sic-raw-collection.json"),
    `${JSON.stringify(sicCollection, null, 2)}\n`,
    "utf8",
  );
  batches = buildSicAcquisitionBatches({
    context,
    collection: sicCollection,
    adapterBySource: new Map(sicRegistry.sources.map((source) => [source.id, source.kind])),
    maxRecords: acquisitionMaxRecords,
  });
} else {
  rankingGroups = await collectRankings(context);
  batches = buildRankingAcquisitionBatches({ context, groups: rankingGroups });
}

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
let processingDurationMs: number | null = null;
if (ingestUrl && secret && processUrl && process.env.VAULT2077_TRIGGER_PROCESSING !== "false") {
  const processingStartedAt = Date.now();
  const response = await postLongRunningJson(
    processUrl,
    {
      authorization: `Bearer ${process.env.VAULT2077_PIPELINE_WORKER_SECRET || secret}`,
      "content-type": "application/json",
    },
    JSON.stringify({ maxBatches: 50 }),
    Number(process.env.VAULT2077_PROCESS_TIMEOUT_SECONDS ?? "5400") * 1_000,
  );
  if ((response.status < 200 || response.status >= 300) && response.status !== 207) {
    throw new Error(`统一 Worker 返回 HTTP ${response.status}：${response.body.slice(0, 500)}`);
  }
  processing = JSON.parse(response.body) as unknown;
  processingDurationMs = Date.now() - processingStartedAt;
}

const sourceReports = batches.flatMap((batch) => batch.sourceReports);
const sourceBundleById = new Map(sourceBundle.sources.map((source) => [source.id, source]));
const sicSourceById = new Map(sicRegistry.sources.map((source) => [source.id, source]));
const vaultOutcomeById = new Map((vault?.report.outcomes ?? []).map((outcome) => [
  outcome.sourceId ?? outcome.source_id ?? "",
  outcome,
]));
const rankingNames = new Map([
  ["ranking:github:today", "GitHub Trending Today"],
  ["ranking:github:week", "GitHub Trending This week"],
  ["ranking:github:month", "GitHub Trending This month"],
  ["ranking:hugging-face:trending", "Hugging Face Trending"],
  ["ranking:openrouter:top-weekly", "OpenRouter Top Weekly"],
  ["ranking:skills:all-time", "Skill All Time"],
  ["ranking:skills:trending-24h", "Skill Trending 24h"],
  ["ranking:skills:hot", "Skill Hot"],
]);
const statusWeight = { empty: 0, succeeded: 1, partial: 2, failed: 3 } as const;
const consolidatedReports = new Map<string, typeof sourceReports[number]>();
for (const item of sourceReports) {
  const previous = consolidatedReports.get(item.sourceId);
  if (!previous) {
    consolidatedReports.set(item.sourceId, { ...item });
    continue;
  }
  consolidatedReports.set(item.sourceId, {
    ...previous,
    status: statusWeight[item.status] > statusWeight[previous.status] ? item.status : previous.status,
    startedAt: Date.parse(item.startedAt) < Date.parse(previous.startedAt) ? item.startedAt : previous.startedAt,
    completedAt: Date.parse(item.completedAt) > Date.parse(previous.completedAt) ? item.completedAt : previous.completedAt,
    recordCount: previous.recordCount + item.recordCount,
    errorCode: previous.errorCode ?? item.errorCode,
    errorMessage: previous.errorMessage ?? item.errorMessage,
  });
}
const detailedSourceReports = [...consolidatedReports.values()]
  .map((item) => {
    const vaultSource = sourceBundleById.get(item.sourceId);
    const sicSource = sicSourceById.get(item.sourceId);
    const rankingName = rankingNames.get(item.sourceId);
    const synthetic = item.sourceId === "vault:github-projects";
    const section = vaultSource
      ? vaultSource.contentGroup === "roadside" || ["roadside", "statements"].includes(vaultSource.sourceStream ?? "")
        ? "roadside"
        : "information"
      : sicSource
        ? "sic"
        : rankingName
          ? "rankings"
          : synthetic
            ? "projects"
            : "other";
    return {
      ...item,
      name: vaultSource?.name
        ?? sicSource?.name
        ?? rankingName
        ?? (synthetic ? "GitHub 项目补全" : item.sourceId),
      section,
      connector: vaultSource?.connector ?? sicSource?.kind ?? item.adapter,
      originPlatform: vaultSource?.originPlatform ?? (section === "roadside" ? "x" : "web"),
      registered: !synthetic,
      durationMs: vaultOutcomeById.get(item.sourceId)?.duration_ms ?? null,
    };
  })
  .sort((left, right) => (
    left.section.localeCompare(right.section)
    || left.name.localeCompare(right.name)
    || left.sourceId.localeCompare(right.sourceId)
  ));
const registeredSourceReports = detailedSourceReports.filter((item) => item.registered);
const recordsByKind = Object.fromEntries(
  ["information", "publication", "entity_profile", "repository_observation", "ranking_observation"]
    .map((kind) => [
      kind,
      batches.reduce(
        (sum, batch) => sum + batch.records.filter((record) => record.kind === kind).length,
        0,
      ),
    ]),
);
const report = {
  runId,
  lane,
  runMode,
  scheduleId: context.scheduleId,
  windowFrom: context.windowFrom,
  windowUntil: context.windowUntil,
  registryRevision: context.registryRevision,
  collectedFrom: context.collectedFrom,
  collectedUntil: context.collectedUntil,
  collectedAt: context.collectedAt,
  batches: batches.length,
  records: batches.reduce((sum, batch) => sum + batch.records.length, 0),
  recordsByKind,
  sources: registeredSourceReports.length,
  sourceStatus: Object.fromEntries(
    ["succeeded", "partial", "empty", "failed"].map((status) => [
      status,
      registeredSourceReports.filter((item) => item.status === status).length,
    ]),
  ),
  sourceReports: detailedSourceReports,
  collectionLimits: {
    lookbackHours,
    maxItemsPerSource: runMode === "bootstrap" && lane === "sic" ? 1 : null,
  },
  processor: {
    provider: process.env.VAULT2077_LLM_BASE_URL
      ? new URL(process.env.VAULT2077_LLM_BASE_URL).hostname
      : null,
    model: process.env.VAULT2077_LLM_MODEL ?? null,
    durationMs: processingDurationMs,
  },
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
