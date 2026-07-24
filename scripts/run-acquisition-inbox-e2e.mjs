import { spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

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

async function waitUntilReady(url, child, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`服务提前退出（${child.exitCode}）：${output()}`);
    }
    try {
      await fetch(url, { signal: AbortSignal.timeout(2_000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`等待服务启动超时：${output()}`);
}

function signedHeaders(secret, batchId, rawPayload, timestamp) {
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

const port = await availablePort();
const root = await mkdtemp(path.join(tmpdir(), "vault2077-acquisition-e2e-"));
const dataDirectory = path.join(root, "data");
const secret = "vault2077-acquisition-e2e-secret-32-bytes";
let output = "";
const site = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VAULT2077_DATA_DIR: dataDirectory,
    VAULT2077_PIPELINE_SHARED_SECRET: secret,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
site.stdout.on("data", (chunk) => { output += chunk; });
site.stderr.on("data", (chunk) => { output += chunk; });

try {
  const origin = `http://127.0.0.1:${port}`;
  await waitUntilReady(origin, site, () => output);
  const observedAt = new Date().toISOString();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const batch = {
    schemaVersion: 1,
    batchId: `batch:${timestamp}:http-e2e`,
    runId: `run:${timestamp}:http-e2e`,
    registryRevision: "sources:http-e2e",
    collectedFrom: observedAt,
    collectedUntil: observedAt,
    collectedAt: observedAt,
    records: [{
      schemaVersion: 1,
      kind: "information",
      recordId: `information:http-e2e:${timestamp}`,
      sourceId: "http-e2e",
      externalId: timestamp,
      canonicalUrl: "https://example.com/vault2077-http-e2e",
      observedAt,
      contentHash: createHash("sha256").update("http-e2e").digest("hex"),
      payload: { title: "HTTP end-to-end acquisition" },
    }],
    sourceReports: [{
      sourceId: "http-e2e",
      adapter: "http-e2e",
      status: "succeeded",
      startedAt: observedAt,
      completedAt: observedAt,
      recordCount: 1,
    }],
  };
  const rawPayload = JSON.stringify(batch);
  const headers = signedHeaders(secret, batch.batchId, rawPayload, timestamp);

  const first = await fetch(`${origin}/api/internal/acquisition`, {
    method: "POST",
    headers,
    body: rawPayload,
  });
  const firstBody = await first.json();
  assert(first.status === 202, `首次投递应返回 202，实际为 ${first.status}。`);
  assert(firstBody.ok === true && firstBody.duplicate === false, "首次投递响应无效。");

  const duplicate = await fetch(`${origin}/api/internal/acquisition`, {
    method: "POST",
    headers,
    body: rawPayload,
  });
  const duplicateBody = await duplicate.json();
  assert(duplicate.status === 202, `pending 重投应返回 202，实际为 ${duplicate.status}。`);
  assert(duplicateBody.ok === true && duplicateBody.duplicate === true, "重投未被识别为重复批次。");

  const changedPayload = JSON.stringify({
    ...batch,
    records: [{ ...batch.records[0], payload: { title: "Conflicting body" } }],
  });
  const conflict = await fetch(`${origin}/api/internal/acquisition`, {
    method: "POST",
    headers: signedHeaders(secret, batch.batchId, changedPayload, timestamp),
    body: changedPayload,
  });
  const conflictBody = await conflict.json();
  assert(conflict.status === 409 && conflictBody.code === "BATCH_CONFLICT", "异文重投未返回 BATCH_CONFLICT。");

  const files = await readdir(path.join(dataDirectory, "acquisition-inbox"));
  assert(files.length === 1, `收件箱应只有一个批次文件，实际为 ${files.length}。`);
  const persisted = JSON.parse(await readFile(path.join(dataDirectory, "acquisition-inbox", files[0]), "utf8"));
  assert(persisted.rawPayload === rawPayload, "落盘原始正文与签名正文不一致。");
  assert(persisted.status === "pending" && persisted.recordCount === 1, "落盘状态或记录计数无效。");

  console.log("统一采集 HTTP E2E 通过：首次 202、重复识别、异文 409、原始正文持久化。");
} finally {
  if (site.exitCode === null) site.kill();
  await new Promise((resolve) => setTimeout(resolve, 250));
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
