import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

test("runtime ranking snapshot is derived from the single bootstrap seed", async () => {
  const runner = await readFile(path.join(root, "scripts", "run-local-full-pipeline.mjs"), "utf8");

  await assert.rejects(access(path.join(root, "data", "direct-rankings.json")));
  assert.match(runner, /data["'], ["']bootstrap["'], ["']direct-rankings\.seed\.json/);
});

test("generated OPC catalog declares its source and edit boundary", async () => {
  const catalog = await readFile(path.join(root, "OPC-Service-Catalog-Complete.md"), "utf8");

  assert.match(catalog, /自动生成文件/);
  assert.match(catalog, /请勿手工编辑/);
  assert.match(catalog, /scripts\/export-opc-catalog-markdown\.mjs/);
});

test("historical launch and early OPC research materials live outside the active root", async () => {
  for (const name of [
    "Vault2077-Formal-Launch-Execution-Plan-2026-07-30.md",
    "Vault2077-Launch-Readiness-Audit-2026-07-30.md",
    "Vault2077-Owner-Launch-Actions-2026-07-30.md",
    "Vault2077-Production-Deployment-Plan-2026-07-31.md",
  ]) {
    await assert.rejects(access(path.join(root, name)));
    await access(path.join(root, "docs", "archive", name));
  }
  await assert.rejects(access(path.join(root, "OPC首版SKU精选包")));
  await access(path.join(root, "archive", "legacy-research", "OPC首版SKU精选包", "00_首版SKU总目录.md"));
});
