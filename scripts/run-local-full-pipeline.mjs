import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import {
  closeSync,
  mkdirSync,
  openSync,
} from "node:fs";
import {
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  assertCollectorReport,
  localUvEnvironment,
  selectedPipelineLanes,
} from "./local-pipeline-runner-helpers.mjs";

const root = process.cwd();
try {
  process.loadEnvFile(path.join(root, ".env.local"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
const port = Number(process.env.VAULT2077_LOCAL_PIPELINE_PORT ?? "3100");
const python = process.env.VAULT2077_PYTHON || (process.platform === "win32" ? "uv" : "python3");
const stamp = new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
const resumeRunDirectory = process.env.VAULT2077_LOCAL_RESUME_RUN_DIR?.trim();
const resumeLanes = new Set(
  (process.env.VAULT2077_LOCAL_RESUME_LANES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const runRoot = path.resolve(
  resumeRunDirectory
    || process.env.VAULT2077_LOCAL_RUN_DIR
    || path.join(".collector-output", "runs", stamp),
);
const lanes = selectedPipelineLanes(process.env);
const uvEnvironment = localUvEnvironment(root, runRoot, process.env);
const collectorRoot = path.join(runRoot, "collector");
const dataRoot = path.join(runRoot, "data");
const localSecret = `vault2077-local-${randomBytes(24).toString("base64url")}`;
const runMode = process.env.VAULT2077_ACQUISITION_RUN_MODE ?? "bootstrap";
if (!["bootstrap", "incremental"].includes(runMode)) {
  throw new Error("VAULT2077_ACQUISITION_RUN_MODE 必须是 bootstrap 或 incremental。");
}
const localRounds = Math.max(
  1,
  Math.min(3, Number(process.env.VAULT2077_LOCAL_ROUNDS ?? (runMode === "bootstrap" ? "1" : "3"))),
);
const useEnvironmentProxy = Boolean(
  process.env.HTTP_PROXY
  || process.env.HTTPS_PROXY
  || process.env.ALL_PROXY,
);
let localGithubToken = process.env.GITHUB_TOKEN?.trim() || "";
if (!localGithubToken) {
  try {
    localGithubToken = execFileSync(
      process.platform === "win32" ? "gh.exe" : "gh",
      ["auth", "token"],
      { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    // Public GitHub endpoints remain usable at their anonymous rate limit.
  }
}

const modelValues = {
  baseUrl: process.env.VAULT2077_VAULT_LLM_BASE_URL ?? process.env.VAULT2077_LLM_BASE_URL,
  apiKey: process.env.VAULT2077_VAULT_LLM_API_KEY ?? process.env.VAULT2077_LLM_API_KEY,
  model: process.env.VAULT2077_VAULT_LLM_MODEL ?? process.env.VAULT2077_LLM_MODEL,
};
const sicModelValues = {
  baseUrl: process.env.VAULT2077_SIC_LLM_BASE_URL ?? modelValues.baseUrl,
  apiKey: process.env.VAULT2077_SIC_LLM_API_KEY ?? modelValues.apiKey,
  model: process.env.VAULT2077_SIC_LLM_MODEL ?? modelValues.model,
};
const missingModelVariables = Object.entries(modelValues)
  .filter(([, value]) => !value?.trim())
  .map(([key]) => key);
if (missingModelVariables.length > 0) {
  throw new Error(`本地全量试跑缺少模型配置：${missingModelVariables.join(", ")}`);
}
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("VAULT2077_LOCAL_PIPELINE_PORT 必须是有效端口。");
}

mkdirSync(collectorRoot, { recursive: true });
mkdirSync(dataRoot, { recursive: true });
const rankingSeedPath = path.join(root, "data", "direct-rankings.json");
try {
  await writeFile(
    path.join(dataRoot, "direct-rankings.json"),
    await readFile(rankingSeedPath),
  );
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const siteStdoutPath = path.join(runRoot, "site.stdout.log");
const siteStderrPath = path.join(runRoot, "site.stderr.log");
const collectorStdoutPath = path.join(runRoot, "collector.stdout.log");
const collectorStderrPath = path.join(runRoot, "collector.stderr.log");
const siteStdout = openSync(siteStdoutPath, "a");
const siteStderr = openSync(siteStderrPath, "a");
const site = spawn(process.execPath, [
  "node_modules/next/dist/bin/next",
  "start",
  "-p",
  String(port),
], {
  cwd: root,
  detached: true,
  windowsHide: true,
  env: {
    ...process.env,
    ...(localGithubToken ? { GITHUB_TOKEN: localGithubToken } : {}),
    ...(useEnvironmentProxy ? { NODE_USE_ENV_PROXY: "1" } : {}),
    VAULT2077_DATA_DIR: dataRoot,
    VAULT2077_ALLOW_FILE_PREVIEW: "true",
    VAULT2077_PIPELINE_RUN_DIR: collectorRoot,
    VAULT2077_PIPELINE_SIGNING_KEYS: JSON.stringify({ local: localSecret }),
    VAULT2077_PIPELINE_ACTIVE_KEY_ID: "local",
    VAULT2077_PIPELINE_WORKER_SECRET: localSecret,
    VAULT2077_AUDIT_HASH_SECRET: localSecret,
    VAULT2077_CONTENT_PREVIEW_LABEL: "本地全量真实试跑",
    VAULT2077_VAULT_LLM_BASE_URL: modelValues.baseUrl,
    VAULT2077_VAULT_LLM_API_KEY: modelValues.apiKey,
    VAULT2077_VAULT_LLM_MODEL: modelValues.model,
    VAULT2077_VAULT_LLM_TIMEOUT_MS: process.env.VAULT2077_VAULT_LLM_TIMEOUT_MS ?? process.env.VAULT2077_LLM_TIMEOUT_MS ?? "120000",
    VAULT2077_VAULT_LLM_BATCH_ITEMS: process.env.VAULT2077_VAULT_LLM_BATCH_ITEMS ?? process.env.VAULT2077_LLM_BATCH_ITEMS ?? "5",
    VAULT2077_VAULT_LLM_MAX_TOKENS: process.env.VAULT2077_VAULT_LLM_MAX_TOKENS ?? process.env.VAULT2077_LLM_MAX_TOKENS ?? "6000",
    VAULT2077_VAULT_LLM_REASONING_EFFORT: process.env.VAULT2077_VAULT_LLM_REASONING_EFFORT ?? process.env.VAULT2077_LLM_REASONING_EFFORT ?? "low",
    VAULT2077_SIC_LLM_BASE_URL: sicModelValues.baseUrl,
    VAULT2077_SIC_LLM_API_KEY: sicModelValues.apiKey,
    VAULT2077_SIC_LLM_MODEL: sicModelValues.model,
    VAULT2077_SIC_LLM_TIMEOUT_MS: process.env.VAULT2077_SIC_LLM_TIMEOUT_MS ?? "120000",
  },
  stdio: ["ignore", siteStdout, siteStderr],
});
closeSync(siteStdout);
closeSync(siteStderr);

async function waitUntilReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (site.exitCode !== null) {
      const stderr = await readFile(siteStderrPath, "utf8").catch(() => "");
      throw new Error(`本地网站启动失败：${stderr.slice(-1_000)}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/pipeline`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status < 500) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("等待本地管线网站启动超时。");
}

function postLocalJson(url, secret, value, timeoutMs) {
  const body = JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`本地重试在 ${timeoutMs} ms 内没有完成。`));
    });
    request.on("error", reject);
    request.end(body);
  });
}

function mergeProcessing(previous, retry) {
  const retriedSuccessIds = new Set((retry.processed ?? []).map((item) => item.batchId));
  return {
    ...previous,
    ok: retry.failed?.length === 0 && retry.queue?.retryable === 0 && retry.queue?.quarantined === 0,
    partial: retry.failed?.length > 0 || retry.queue?.retryable > 0 || retry.queue?.quarantined > 0,
    processed: [
      ...(previous?.processed ?? []),
      ...(retry.processed ?? []),
    ],
    failed: [
      ...(previous?.failed ?? []).filter((item) => !retriedSuccessIds.has(item.batchId)),
      ...(retry.failed ?? []),
    ],
    queue: retry.queue,
  };
}

function runCollector(lane, round) {
  return new Promise((resolve, reject) => {
    const stdout = openSync(collectorStdoutPath, "a");
    const stderr = openSync(collectorStderrPath, "a");
    const child = spawn(process.execPath, [
      "--conditions=react-server",
      "--experimental-strip-types",
      "scripts/collect-unified-acquisition.ts",
    ], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        ...uvEnvironment,
        ...(localGithubToken ? { GITHUB_TOKEN: localGithubToken } : {}),
        ...(useEnvironmentProxy ? { NODE_USE_ENV_PROXY: "1" } : {}),
        VAULT2077_PYTHON: python,
        VAULT2077_COLLECTOR_OUTPUT_DIR: collectorRoot,
        VAULT2077_ACQUISITION_LANE: lane,
        VAULT2077_ACQUISITION_RUN_MODE: runMode,
        VAULT2077_SCHEDULE_ID: `local:${stamp}:round-${round}:${lane}`,
        VAULT2077_DOMESTIC_ACQUISITION_URL: `http://127.0.0.1:${port}/api/internal/acquisition`,
        VAULT2077_PIPELINE_SIGNING_KEYS: JSON.stringify({ local: localSecret }),
        VAULT2077_PIPELINE_ACTIVE_KEY_ID: "local",
        VAULT2077_REQUIRE_DOMESTIC_DELIVERY: "true",
        VAULT2077_COLLECTION_LOOKBACK_HOURS: process.env.VAULT2077_COLLECTION_LOOKBACK_HOURS
          ?? (lane === "sic" ? "24" : "12"),
        VAULT2077_ACQUISITION_MAX_RECORDS: process.env.VAULT2077_ACQUISITION_MAX_RECORDS ?? "40",
        VAULT2077_COLLECTOR_CONCURRENCY: process.env.VAULT2077_COLLECTOR_CONCURRENCY ?? "20",
        VAULT2077_HORIZON_CONCURRENCY: process.env.VAULT2077_HORIZON_CONCURRENCY ?? "16",
        VAULT2077_PER_HOST_CONCURRENCY: process.env.VAULT2077_PER_HOST_CONCURRENCY ?? "3",
        VAULT2077_SOURCE_TIMEOUT_SECONDS: process.env.VAULT2077_SOURCE_TIMEOUT_SECONDS ?? "20",
      },
      stdio: ["ignore", stdout, stderr],
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      closeSync(stdout);
      closeSync(stderr);
      resolve(code ?? 1);
    });
  });
}

try {
  await waitUntilReady();
  const laneReports = [];
  const collectorExitCodes = {};
  for (let round = 1; round <= localRounds; round += 1) {
  for (const lane of lanes) {
    const resumeExistingLane = round === 1 && resumeLanes.has(lane);
    const collectorExitCode = resumeExistingLane ? 0 : await runCollector(lane, round);
    collectorExitCodes[`round-${round}:${lane}`] = collectorExitCode;
    const report = JSON.parse(
      await readFile(path.join(collectorRoot, "acquisition-report.json"), "utf8"),
    );
    assertCollectorReport(lane, collectorExitCode, report);
  const initialProcessingStartedAt = Date.now();
  const initialResponse = await postLocalJson(
    `http://127.0.0.1:${port}/api/internal/acquisition/process`,
    localSecret,
    { maxBatches: 50 },
    Number(process.env.VAULT2077_PROCESS_TIMEOUT_SECONDS ?? "5400") * 1_000,
  );
  if ((initialResponse.status < 200 || initialResponse.status >= 300) && initialResponse.status !== 207) {
    throw new Error(`本地 Worker 返回 HTTP ${initialResponse.status}：${initialResponse.body.slice(0, 500)}`);
  }
  report.processing = JSON.parse(initialResponse.body);
  const retryLimit = Math.max(
    0,
    Math.min(5, Number(process.env.VAULT2077_LOCAL_RETRY_PASSES ?? "2")),
  );
  let retryDurationMs = Date.now() - initialProcessingStartedAt;
  let retries = 0;
  while (
    retries < retryLimit
    && (
      (report.processing?.failed?.length ?? 0) > 0
      || (report.processing?.queue?.retryable ?? 0) > 0
      || (report.processing?.queue?.quarantined ?? 0) > 0
    )
  ) {
    retries += 1;
    const startedAt = Date.now();
    const response = await postLocalJson(
      `http://127.0.0.1:${port}/api/internal/acquisition/process`,
      localSecret,
      { maxBatches: 50 },
      Number(process.env.VAULT2077_PROCESS_TIMEOUT_SECONDS ?? "5400") * 1_000,
    );
    retryDurationMs += Date.now() - startedAt;
    if ((response.status < 200 || response.status >= 300) && response.status !== 207) {
      throw new Error(`本地重试 Worker 返回 HTTP ${response.status}：${response.body.slice(0, 500)}`);
    }
    report.processing = mergeProcessing(report.processing, JSON.parse(response.body));
  }
  const laneModel = lane === "sic"
    ? sicModelValues
    : lane === "rankings"
      ? null
      : modelValues;
  report.processor = {
    provider: laneModel ? new URL(laneModel.baseUrl).hostname : null,
    model: laneModel?.model ?? null,
    durationMs: retryDurationMs,
  };
  report.localRetry = {
    passes: retries,
    durationMs: retryDurationMs,
    recovered: retries > 0 && (report.processing?.failed?.length ?? 0) === 0,
  };
  await writeFile(
    path.join(collectorRoot, `acquisition-report-round-${round}-${lane}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
    laneReports.push(report);
  }
  }
  const currentLaneReports = lanes.map((lane) => (
    [...laneReports].reverse().find((item) => item.lane === lane)
  )).filter(Boolean);
  const report = {
    version: 2,
    runId: `local:${stamp}`,
    registryRevision: currentLaneReports[0]?.registryRevision ?? "unknown",
    collectedFrom: laneReports.map((item) => item.collectedFrom).sort()[0],
    collectedUntil: laneReports.map((item) => item.collectedUntil).sort().at(-1),
    collectedAt: new Date().toISOString(),
    batches: currentLaneReports.reduce((sum, item) => sum + item.batches, 0),
    records: currentLaneReports.reduce((sum, item) => sum + item.records, 0),
    recordsByKind: Object.fromEntries(
      ["information", "publication", "entity_profile", "repository_observation", "ranking_observation"]
        .map((kind) => [kind, currentLaneReports.reduce((sum, item) => sum + (item.recordsByKind?.[kind] ?? 0), 0)]),
    ),
    sources: currentLaneReports.reduce((sum, item) => sum + item.sources, 0),
    sourceStatus: Object.fromEntries(
      ["succeeded", "partial", "empty", "failed"]
        .map((status) => [status, currentLaneReports.reduce((sum, item) => sum + (item.sourceStatus?.[status] ?? 0), 0)]),
    ),
    sourceReports: currentLaneReports.flatMap((item) => item.sourceReports ?? []),
    runMode,
    collectionLimits: {
      informationAndRoadsideLookbackHours: runMode === "bootstrap" ? 30 * 24 : 12,
      sicMaxItemsPerSource: runMode === "bootstrap" ? 1 : null,
    },
    processor: {
      provider: currentLaneReports.find((item) => item.processor?.provider)?.processor.provider ?? null,
      model: currentLaneReports.find((item) => item.processor?.model)?.processor.model ?? null,
      durationMs: laneReports.reduce((sum, item) => sum + (item.processor?.durationMs ?? 0), 0),
    },
    files: currentLaneReports.flatMap((item) => item.files ?? []),
    receipts: currentLaneReports.flatMap((item) => item.receipts ?? []),
    processing: {
      ok: laneReports.every((item) => item.processing?.ok === true),
      partial: laneReports.some((item) => item.processing?.partial === true),
      processed: laneReports.flatMap((item) => item.processing?.processed ?? []),
      failed: laneReports.flatMap((item) => item.processing?.failed ?? []),
      warnings: laneReports.flatMap((item) => item.processing?.warnings ?? []),
      queue: laneReports.at(-1)?.processing?.queue ?? null,
    },
    laneReports,
    validationRounds: localRounds,
  };
  await writeFile(
    path.join(dataRoot, "pipeline-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(path.join(runRoot, "local-run.json"), `${JSON.stringify({
    version: 1,
    completedAt: new Date().toISOString(),
    sitePid: site.pid,
    collectorExitCodes,
    siteUrl: `http://localhost:${port}/pipeline`,
    report: {
      runId: report.runId,
      sources: report.sources,
      sourceStatus: report.sourceStatus,
      records: report.records,
      recordsByKind: report.recordsByKind,
      processor: report.processor,
    },
  }, null, 2)}\n`, "utf8");
  site.unref();
  console.log(JSON.stringify({
    ok: Boolean(report.processing && report.processing.ok),
    collectorExitCodes,
    sitePid: site.pid,
    siteUrl: `http://localhost:${port}/pipeline`,
    runDirectory: runRoot,
    sources: report.sources,
    sourceStatus: report.sourceStatus,
    records: report.records,
    recordsByKind: report.recordsByKind,
    processor: report.processor,
  }, null, 2));
} catch (error) {
  if (site.exitCode === null) site.kill();
  throw error;
}
