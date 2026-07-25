import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/collect-content.yml", import.meta.url),
  "utf8",
);

test("the repository keeps exactly one overseas acquisition workflow", async () => {
  const names = (await readdir(new URL("../.github/workflows/", import.meta.url)))
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  assert.deepEqual(names, ["collect-content.yml"]);
});

test("GitHub Actions schedules four lanes at the approved Beijing cadence", () => {
  for (const cron of [
    "5 */2 * * *",
    "55 */2 * * *",
    "25 11,23 * * *",
    "35 * * * *",
  ]) {
    assert.ok(workflow.includes(`cron: "${cron}"`), cron);
  }
  assert.match(workflow, /group: vault2077-acquisition-\$\{\{ inputs\.run_mode \|\| 'incremental' \}\}-\$\{\{ inputs\.lane \|\| github\.event\.schedule \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /domestic inbox remains the global serial queue/);
});

test("manual bootstrap is explicit while schedules remain incremental", () => {
  assert.match(workflow, /run_mode:\s+description:[\s\S]*?- bootstrap/);
  assert.match(workflow, /run_mode="incremental"/);
  assert.match(workflow, /VAULT2077_ACQUISITION_RUN_MODE: \$\{\{ steps\.lane\.outputs\.run_mode \}\}/);
});

test("collection workflow has no retired ranking credentials", () => {
  for (const retired of [
    "GHARCHIVE",
    "SMITHERY",
    "VERCEL_OIDC",
    "GCP_WORKLOAD",
    "GCP_SERVICE_ACCOUNT",
  ]) {
    assert.ok(!workflow.includes(retired), retired);
  }
});
