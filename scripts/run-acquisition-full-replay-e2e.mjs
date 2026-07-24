import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

const batchDirectory = process.argv[2] ? path.resolve(process.argv[2]) : "";
if (!batchDirectory) {
  throw new Error("Usage: node scripts/run-acquisition-full-replay-e2e.mjs <acquisition-batches-directory>");
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitUntilReady(url, children, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    for (const child of children) {
      if (child.exitCode !== null) {
        throw new Error(`测试服务提前退出（${child.exitCode}）：${output()}`);
      }
    }
    try {
      await fetch(url, { signal: AbortSignal.timeout(2_000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`等待本地服务启动超时：${output()}`);
}

function signedHeaders(secret, batchId, rawPayload) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyHash = createHash("sha256").update(rawPayload).digest("hex");
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${batchId}.${bodyHash}`)
    .digest("base64url");
  return {
    "content-type": "application/json",
    "x-vault2077-batch-id": batchId,
    "x-vault2077-timestamp": timestamp,
    "x-vault2077-signature": `sha256=${signature}`,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const batchFiles = (await readdir(batchDirectory))
  .filter((name) => name.endsWith(".json"))
  .sort();
assert(batchFiles.length > 0, `没有在 ${batchDirectory} 找到采集批次。`);
const payloads = await Promise.all(batchFiles.map(async (name) => {
  const rawPayload = await readFile(path.join(batchDirectory, name), "utf8");
  return { rawPayload, batch: JSON.parse(rawPayload) };
}));
const expected = payloads.reduce((totals, { batch }) => {
  totals.records += batch.records.length;
  totals.sources += batch.sourceReports.length;
  for (const record of batch.records) {
    totals.kinds[record.kind] = (totals.kinds[record.kind] ?? 0) + 1;
  }
  return totals;
}, { records: 0, sources: 0, kinds: {} });

const [modelPort, sitePort] = await Promise.all([availablePort(), availablePort()]);
const root = await mkdtemp(path.join(tmpdir(), "vault2077-full-replay-"));
const dataDirectory = path.join(root, "data");
const secret = "vault2077-full-replay-secret-32-bytes";
let output = "";
const model = spawn(process.execPath, ["scripts/mock-openai-server.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, MOCK_OPENAI_PORT: String(modelPort) },
  stdio: ["ignore", "pipe", "pipe"],
});
const site = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(sitePort)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VAULT2077_DATA_DIR: dataDirectory,
    VAULT2077_PIPELINE_SHARED_SECRET: secret,
    VAULT2077_LLM_BASE_URL: `http://127.0.0.1:${modelPort}/v1`,
    VAULT2077_LLM_API_KEY: "local-replay-key",
    VAULT2077_LLM_MODEL: "local-replay-model",
    VAULT2077_LLM_TIMEOUT_MS: "120000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
for (const child of [model, site]) {
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
}

try {
  const origin = `http://127.0.0.1:${sitePort}`;
  await waitUntilReady(origin, [model, site], () => output);
  const receipts = [];
  for (const { rawPayload, batch } of payloads) {
    const response = await fetch(`${origin}/api/internal/acquisition`, {
      method: "POST",
      headers: signedHeaders(secret, batch.batchId, rawPayload),
      body: rawPayload,
      signal: AbortSignal.timeout(60_000),
    });
    const body = await response.json();
    assert(response.status === 202, `批次 ${batch.batchId} 接收失败：HTTP ${response.status} ${JSON.stringify(body)}`);
    receipts.push(body);
  }

  const processResponse = await fetch(`${origin}/api/internal/acquisition/process`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ maxBatches: 50 }),
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  const processing = await processResponse.json();
  assert(processResponse.status === 200, `Worker 处理失败：HTTP ${processResponse.status} ${JSON.stringify(processing)}`);
  assert(processing.processed.length === payloads.length, `应处理 ${payloads.length} 个批次，实际 ${processing.processed.length}。`);
  assert(processing.failed.length === 0, `存在失败批次：${JSON.stringify(processing.failed)}`);
  assert(processing.queue.pending === 0 && processing.queue.processing === 0 && processing.queue.failed === 0, "处理后队列并非全绿。");

  const processedKinds = processing.processed.reduce((totals, item) => {
    for (const [kind, count] of Object.entries(item.result)) {
      totals[kind] = (totals[kind] ?? 0) + count;
    }
    return totals;
  }, {});
  console.log(JSON.stringify({
    ok: true,
    batches: payloads.length,
    records: expected.records,
    sources: expected.sources,
    inputKinds: expected.kinds,
    processedKinds,
    receipts: receipts.length,
    queue: processing.queue,
  }));
} finally {
  for (const child of [site, model]) {
    if (child.exitCode === null) child.kill();
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
