import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/collect-content.yml", import.meta.url),
  "utf8",
);
const qualityWorkflow = await readFile(
  new URL("../.github/workflows/quality-check.yml", import.meta.url),
  "utf8",
);
const nginx = await readFile(
  new URL("../deploy/nginx/vault2077.conf.example", import.meta.url),
  "utf8",
);
const workerTimer = await readFile(
  new URL("../deploy/systemd/vault2077-acquisition-worker.timer", import.meta.url),
  "utf8",
);
const frontierTimer = await readFile(
  new URL("../deploy/systemd/vault2077-frontier-tick.timer", import.meta.url),
  "utf8",
);

test("the repository keeps exactly one overseas acquisition workflow", async () => {
  const names = (await readdir(new URL("../.github/workflows/", import.meta.url)))
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  assert.deepEqual(names, ["collect-content.yml", "quality-check.yml"]);
  assert.equal(names.filter((name) => name.startsWith("collect-")).length, 1);
});

test("GitHub Actions schedules four lanes at the approved Beijing cadence", () => {
  for (const cron of [
    "5 0,2,4,6,8,10,12,14 * * *",
    "55 0,2,4,6,8,10,12,14 * * *",
    "25 0 * * *",
    "35 0,4,8,12 * * *",
  ]) {
    assert.ok(workflow.includes(`cron: "${cron}"`), cron);
  }
  assert.match(workflow, /group: vault2077-acquisition-\$\{\{ inputs\.run_mode \|\| 'incremental' \}\}-\$\{\{ inputs\.lane \|\| github\.event\.schedule \}\}/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /domestic inbox remains the global serial queue/);
});

test("full repository checks run outside collection jobs", () => {
  assert.doesNotMatch(workflow, /npm run lint|npm run typecheck|ruff check|unittest discover/);
  assert.match(qualityWorkflow, /cron: "30 22 \* \* \*"/);
  assert.match(qualityWorkflow, /npm run docs:check/);
  assert.match(qualityWorkflow, /npm run lint/);
  assert.match(qualityWorkflow, /npm run typecheck/);
  assert.match(qualityWorkflow, /npm test/);
  assert.match(qualityWorkflow, /npm run build/);
  assert.match(qualityWorkflow, /run-acquisition-inbox-e2e\.mjs/);
  assert.match(qualityWorkflow, /run-content-pipeline-e2e\.mjs/);
  assert.match(qualityWorkflow, /ruff check collector/);
  assert.match(qualityWorkflow, /unittest discover/);
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

test("overseas workflow only delivers signed batches and never invokes the domestic worker", () => {
  assert.match(workflow, /VAULT2077_PIPELINE_SIGNING_KEYS/);
  assert.match(workflow, /VAULT2077_PIPELINE_ACTIVE_KEY_ID/);
  assert.match(workflow, /VAULT2077_FRONTIER_TASKS_SECRET/);
  assert.match(workflow, /VAULT2077_DELIVERY_ATTEMPTS: "4"/);
  assert.doesNotMatch(workflow, /DOMESTIC_ACQUISITION_PROCESS_URL/);
  assert.doesNotMatch(workflow, /PIPELINE_WORKER_SECRET/);
  assert.doesNotMatch(workflow, /TRIGGER_PROCESSING/);
});

test("the public proxy exposes only the two cross-border routes and the domestic worker is timed locally", () => {
  assert.match(nginx, /location = \/api\/internal\/acquisition \{/);
  assert.match(nginx, /if \(\$request_method != POST\) \{ return 405; \}/);
  assert.match(nginx, /location = \/api\/internal\/frontier\/tasks \{/);
  assert.match(nginx, /if \(\$request_method != GET\) \{ return 405; \}/);
  assert.match(nginx, /location \^~ \/api\/internal\/ \{ return 404; \}/);
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(workerTimer, /OnCalendar=\*:0\/5/);
  assert.match(workerTimer, /Persistent=true/);
  assert.match(frontierTimer, /08,10,12,14,16,18,20,22:45:00 Asia\/Shanghai/);
});
