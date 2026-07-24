import { spawn } from "node:child_process";
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

const root = process.cwd();
const port = Number(process.env.VAULT2077_LOCAL_PIPELINE_PORT ?? "3100");
const python = process.env.VAULT2077_PYTHON || (process.platform === "win32" ? "python" : "python3");
const stamp = new Date().toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
const runRoot = path.resolve(
  process.env.VAULT2077_LOCAL_RUN_DIR
    || path.join(".collector-output", "runs", stamp),
);
const collectorRoot = path.join(runRoot, "collector");
const dataRoot = path.join(runRoot, "data");
const localSecret = `vault2077-local-${randomBytes(24).toString("base64url")}`;

const requiredModelVariables = [
  "VAULT2077_LLM_BASE_URL",
  "VAULT2077_LLM_API_KEY",
  "VAULT2077_LLM_MODEL",
];
const missingModelVariables = requiredModelVariables.filter((key) => !process.env[key]?.trim());
if (missingModelVariables.length > 0) {
  throw new Error(`本地全量试跑缺少模型配置：${missingModelVariables.join(", ")}`);
}
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("VAULT2077_LOCAL_PIPELINE_PORT 必须是有效端口。");
}

mkdirSync(collectorRoot, { recursive: true });
mkdirSync(dataRoot, { recursive: true });

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
    VAULT2077_DATA_DIR: dataRoot,
    VAULT2077_PIPELINE_RUN_DIR: collectorRoot,
    VAULT2077_PIPELINE_SHARED_SECRET: localSecret,
    VAULT2077_PIPELINE_WORKER_SECRET: localSecret,
    VAULT2077_CONTENT_PREVIEW_LABEL: "本地全量真实试跑",
    VAULT2077_LLM_TIMEOUT_MS: process.env.VAULT2077_LLM_TIMEOUT_MS ?? "120000",
    VAULT2077_LLM_BATCH_ITEMS: process.env.VAULT2077_LLM_BATCH_ITEMS ?? "5",
    VAULT2077_LLM_MAX_TOKENS: process.env.VAULT2077_LLM_MAX_TOKENS ?? "6000",
    VAULT2077_LLM_REASONING_EFFORT: process.env.VAULT2077_LLM_REASONING_EFFORT ?? "low",
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
    ok: retry.failed?.length === 0 && retry.queue?.failed === 0,
    partial: retry.failed?.length > 0 || retry.queue?.failed > 0,
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

function runCollector() {
  return new Promise((resolve, reject) => {
    const stdout = openSync(collectorStdoutPath, "a");
    const stderr = openSync(collectorStderrPath, "a");
    const pythonPath = [
      path.join(root, ".collector-python"),
      process.env.PYTHONPATH,
    ].filter(Boolean).join(path.delimiter);
    const child = spawn(process.execPath, [
      "--conditions=react-server",
      "--experimental-strip-types",
      "scripts/collect-unified-acquisition.ts",
    ], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONPATH: pythonPath,
        VAULT2077_PYTHON: python,
        VAULT2077_COLLECTOR_OUTPUT_DIR: collectorRoot,
        VAULT2077_DOMESTIC_ACQUISITION_URL: `http://127.0.0.1:${port}/api/internal/acquisition`,
        VAULT2077_DOMESTIC_ACQUISITION_PROCESS_URL: `http://127.0.0.1:${port}/api/internal/acquisition/process`,
        VAULT2077_PIPELINE_SHARED_SECRET: localSecret,
        VAULT2077_PIPELINE_WORKER_SECRET: localSecret,
        VAULT2077_REQUIRE_DOMESTIC_DELIVERY: "true",
        VAULT2077_TRIGGER_PROCESSING: "true",
        VAULT2077_COLLECTION_LOOKBACK_HOURS: process.env.VAULT2077_COLLECTION_LOOKBACK_HOURS ?? "168",
        VAULT2077_MAX_ITEMS_PER_SOURCE: process.env.VAULT2077_MAX_ITEMS_PER_SOURCE ?? "1",
        VAULT2077_ACQUISITION_MAX_RECORDS: process.env.VAULT2077_ACQUISITION_MAX_RECORDS ?? "40",
        VAULT2077_MAX_TREND_PROJECTS: process.env.VAULT2077_MAX_TREND_PROJECTS ?? "10",
        VAULT2077_COLLECTOR_CONCURRENCY: process.env.VAULT2077_COLLECTOR_CONCURRENCY ?? "20",
        VAULT2077_HORIZON_CONCURRENCY: process.env.VAULT2077_HORIZON_CONCURRENCY ?? "16",
        VAULT2077_PER_HOST_CONCURRENCY: process.env.VAULT2077_PER_HOST_CONCURRENCY ?? "3",
        VAULT2077_SOURCE_TIMEOUT_SECONDS: process.env.VAULT2077_SOURCE_TIMEOUT_SECONDS ?? "20",
        VAULT2077_PROCESS_TIMEOUT_SECONDS: process.env.VAULT2077_PROCESS_TIMEOUT_SECONDS ?? "5400",
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
  const collectorExitCode = await runCollector();
  const report = JSON.parse(
    await readFile(path.join(collectorRoot, "acquisition-report.json"), "utf8"),
  );
  const retryLimit = Math.max(
    0,
    Math.min(5, Number(process.env.VAULT2077_LOCAL_RETRY_PASSES ?? "2")),
  );
  let retryDurationMs = 0;
  let retries = 0;
  while (
    retries < retryLimit
    && (
      (report.processing?.failed?.length ?? 0) > 0
      || (report.processing?.queue?.failed ?? 0) > 0
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
  if (report.processor) {
    report.processor.durationMs = (report.processor.durationMs ?? 0) + retryDurationMs;
  }
  report.localRetry = {
    passes: retries,
    durationMs: retryDurationMs,
    recovered: retries > 0 && (report.processing?.failed?.length ?? 0) === 0,
  };
  await writeFile(
    path.join(collectorRoot, "acquisition-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(dataRoot, "pipeline-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(path.join(runRoot, "local-run.json"), `${JSON.stringify({
    version: 1,
    completedAt: new Date().toISOString(),
    sitePid: site.pid,
    collectorExitCode,
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
    collectorExitCode,
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
