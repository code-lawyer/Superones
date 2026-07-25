import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("routine source health audit cannot mutate admission registry or CSV", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vault2077-source-health-"));
  const registry = path.join(root, "source-registry.json");
  const csv = path.join(root, "source-registry.csv");
  const health = path.join(root, "source-health.json");
  await Promise.all([
    copyFile(new URL("../config/source-registry.json", import.meta.url), registry),
    copyFile(new URL("../docs/Vault2077-Source-Registry.csv", import.meta.url), csv),
    copyFile(new URL("../config/source-health.json", import.meta.url), health),
  ]);
  const [registryBefore, csvBefore] = await Promise.all([
    readFile(registry),
    readFile(csv),
  ]);
  try {
    await execFileAsync(process.execPath, [
      path.resolve("scripts/audit-source-registry.mjs"),
      "--registry", registry,
      "--csv", csv,
      "--health", health,
      "--resume", "true",
      "--concurrency", "1",
      "--per-host", "1",
      "--timeout", "5000",
    ], { cwd: process.cwd(), timeout: 30_000 });
    const [registryAfter, csvAfter, healthAfter] = await Promise.all([
      readFile(registry),
      readFile(csv),
      readFile(health, "utf8"),
    ]);
    assert.deepEqual(registryAfter, registryBefore);
    assert.deepEqual(csvAfter, csvBefore);
    assert.equal(JSON.parse(healthAfter).usableEndpointCount, 311);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
