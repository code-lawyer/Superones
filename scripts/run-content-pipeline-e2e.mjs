import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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

async function waitUntilReady(url, process, output) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`服务提前退出（${process.exitCode}）：${output()}`);
    try {
      await fetch(url);
      return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`等待服务启动超时：${output()}`);
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${args.join(" ")} exited with ${code}`)));
  });
}

const [mockPort, sitePort] = await Promise.all([availablePort(), availablePort()]);
const dataRoot = await mkdtemp(path.join(tmpdir(), "vault2077-pipeline-e2e-"));
const secret = "vault2077-e2e-shared-secret";
const children = [];

try {
  let mockOutput = "";
  const mock = spawn(process.execPath, ["scripts/mock-openai-server.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, MOCK_OPENAI_PORT: String(mockPort) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(mock);
  mock.stdout.on("data", (chunk) => { mockOutput += chunk; });
  mock.stderr.on("data", (chunk) => { mockOutput += chunk; });
  await waitUntilReady(`http://127.0.0.1:${mockPort}/not-found`, mock, () => mockOutput);

  let siteOutput = "";
  const site = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(sitePort)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VAULT2077_DATA_DIR: path.join(dataRoot, "data"),
      VAULT2077_PIPELINE_SHARED_SECRET: secret,
      VAULT2077_PIPELINE_WORKER_SECRET: secret,
      VAULT2077_LLM_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
      VAULT2077_LLM_API_KEY: "e2e-key",
      VAULT2077_LLM_MODEL: "e2e-model",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(site);
  site.stdout.on("data", (chunk) => { siteOutput += chunk; });
  site.stderr.on("data", (chunk) => { siteOutput += chunk; });
  await waitUntilReady(`http://127.0.0.1:${sitePort}/feed`, site, () => siteOutput);

  await run(process.execPath, ["scripts/e2e-content-pipeline.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, VAULT2077_E2E_ORIGIN: `http://127.0.0.1:${sitePort}`, VAULT2077_E2E_SECRET: secret },
    stdio: "inherit",
  });
} finally {
  for (const child of children.reverse()) {
    if (child.exitCode === null) child.kill();
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  await rm(dataRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
