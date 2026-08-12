import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { ACQUISITION_SCHEDULES } from "../lib/acquisition-schedule.ts";

const workflow = await readFile(
  new URL("../.github/workflows/collect-content.yml", import.meta.url),
  "utf8",
);
const qualityWorkflow = await readFile(
  new URL("../.github/workflows/quality-check.yml", import.meta.url),
  "utf8",
);
const releaseWorkflow = await readFile(
  new URL("../.github/workflows/build-release.yml", import.meta.url),
  "utf8",
);
const nginx = await readFile(
  new URL("../deploy/nginx/vault2077.conf.example", import.meta.url),
  "utf8",
);
const nginxEdgeErrorSecurity = await readFile(
  new URL("../deploy/nginx/vault2077-edge-error-security.conf.example", import.meta.url),
  "utf8",
);
const nginxDefaultReject = await readFile(
  new URL("../deploy/nginx/vault2077-default-reject.conf.example", import.meta.url),
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
const healthTimer = await readFile(
  new URL("../deploy/systemd/vault2077-healthcheck.timer", import.meta.url),
  "utf8",
);
const healthService = await readFile(
  new URL("../deploy/systemd/vault2077-healthcheck.service", import.meta.url),
  "utf8",
);
const webService = await readFile(
  new URL("../deploy/systemd/vault2077-web.service", import.meta.url),
  "utf8",
);
const workerService = await readFile(
  new URL("../deploy/systemd/vault2077-acquisition-worker.service", import.meta.url),
  "utf8",
);
const frontierService = await readFile(
  new URL("../deploy/systemd/vault2077-frontier-tick.service", import.meta.url),
  "utf8",
);
const opcOrderMaintenanceService = await readFile(
  new URL("../deploy/systemd/vault2077-opc-order-maintenance.service", import.meta.url),
  "utf8",
);
const rangerMediaCleanupService = await readFile(
  new URL("../deploy/systemd/vault2077-ranger-media-cleanup.service", import.meta.url),
  "utf8",
);
const opcOrderMaintenanceTimer = await readFile(
  new URL("../deploy/systemd/vault2077-opc-order-maintenance.timer", import.meta.url),
  "utf8",
);
const failureNotifier = await readFile(
  new URL("../deploy/systemd/vault2077-failure-notify@.service", import.meta.url),
  "utf8",
);
const productionLogrotate = await readFile(
  new URL("../deploy/logrotate/vault2077", import.meta.url),
  "utf8",
);

test("the repository keeps exactly one overseas acquisition workflow", async () => {
  const names = (await readdir(new URL("../.github/workflows/", import.meta.url)))
    .filter((name) => /\.ya?ml$/.test(name))
    .sort();
  assert.deepEqual(names, ["build-release.yml", "collect-content.yml", "quality-check.yml"]);
  assert.equal(names.filter((name) => name.startsWith("collect-")).length, 1);
});

test("release artifacts are manually built on Linux without production secrets", () => {
  assert.match(releaseWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(releaseWorkflow, /schedule:|push:|pull_request:/);
  assert.match(releaseWorkflow, /permissions:\s+contents: read/);
  assert.match(releaseWorkflow, /runs-on: ubuntu-latest/);
  assert.match(releaseWorkflow, /npm prune --omit=dev/);
  assert.match(releaseWorkflow, /npm run bootstrap:verify/);
  assert.match(releaseWorkflow, /sha256sum/);
  assert.doesNotMatch(releaseWorkflow, /secrets\./);
});

test("GitHub Actions schedules four lanes at the approved Beijing cadence", () => {
  for (const [lane, schedule] of Object.entries(ACQUISITION_SCHEDULES)) {
    assert.ok(workflow.includes(`cron: "${schedule.cron}"`), `${lane}: ${schedule.cron}`);
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
  assert.match(qualityWorkflow, /npm run bootstrap:verify/);
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

test("collection artifacts are retained only after complete evidence validation", () => {
  assert.match(workflow, /name: Resolve scheduled lane[\s\S]*?name: Initialize run evidence[\s\S]*?run: npm ci/);
  assert.match(workflow, /name: Finalize interrupted run evidence[\s\S]*?if: always\(\)[\s\S]*?finalize-acquisition-evidence\.ts/);
  assert.match(workflow, /Finalize interrupted run evidence[\s\S]*?name: Validate run evidence/);
  assert.match(workflow, /name: Validate run evidence[\s\S]*?if: always\(\)[\s\S]*?npm run acquisition:validate-artifact/);
  assert.match(workflow, /if: \$\{\{ always\(\) && hashFiles\('\.collector-output\/\.validated-for-upload'\) != '' \}\}/);
  assert.match(workflow, /include-hidden-files: true/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /retention-days: 30/);
  for (const archivedPath of [
    ".collector-output/run-manifest.json",
    ".collector-output/acquisition-report.json",
    ".collector-output/acquisition-batches",
    ".collector-output/.validated-for-upload",
  ]) {
    assert.ok(workflow.includes(archivedPath), archivedPath);
  }
  assert.doesNotMatch(workflow, /^\s+path: \.collector-output\s*$/m);
});

test("the public proxy exposes only the two cross-border routes and the domestic worker is timed locally", () => {
  assert.match(nginx, /location = \/api\/internal\/acquisition \{/);
  assert.match(nginx, /if \(\$request_method != POST\) \{ return 405; \}/);
  assert.match(nginx, /location = \/api\/internal\/frontier\/tasks \{/);
  assert.match(nginx, /if \(\$request_method != GET\) \{ return 405; \}/);
  assert.match(nginx, /location \^~ \/api\/internal\/ \{ return 404; \}/);
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(nginx, /server_tokens off;/);
  assert.match(nginx, /error_page 404 = @public_edge_not_found;/);
  assert.match(nginx, /error_page 405 = @public_edge_method_not_allowed;/);
  assert.match(nginx, /error_page 404 = @admin_edge_not_found;/);
  assert.match(nginx, /Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;/);
  assert.match(nginxEdgeErrorSecurity, /Content-Security-Policy "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" always;/);
  assert.match(nginxEdgeErrorSecurity, /X-Content-Type-Options "nosniff" always;/);
  assert.match(nginxDefaultReject, /listen 80 default_server;/);
  assert.match(nginxDefaultReject, /listen 443 ssl default_server;/);
  assert.match(nginxDefaultReject, /server_name _;/);
  assert.match(nginxDefaultReject, /return 444;/);
  assert.match(workerTimer, /OnCalendar=\*:0\/5/);
  assert.match(workerTimer, /Persistent=true/);
  assert.match(frontierTimer, /08,10,12,14,16,18,20,22:45:00 Asia\/Shanghai/);
  assert.match(healthTimer, /OnUnitActiveSec=5min/);
  assert.match(healthTimer, /Persistent=true/);
  assert.match(healthService, /EnvironmentFile=\/etc\/vault2077\/production\.env/);
  assert.match(healthService, /npm run health:check/);
  assert.match(healthService, /^LogsDirectory=vault2077$/m);
  assert.match(healthService, /^Environment=VAULT2077_HEALTH_HEARTBEAT_FILE=\/var\/log\/vault2077\/health-heartbeat\.log$/m);
  assert.match(healthService, /RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK/);
});

test("production services emit a uniform journal event when systemd marks them failed", () => {
  for (const service of [webService, workerService, frontierService, healthService, opcOrderMaintenanceService, rangerMediaCleanupService]) {
    assert.match(service, /^OnFailure=vault2077-failure-notify@%n\.service$/m);
  }
  assert.match(failureNotifier, /^ExecStart=\/usr\/bin\/logger --priority daemon\.err --tag vault2077-alert /m);
  assert.match(failureNotifier, /unit=%i/);
  assert.match(failureNotifier, /^LogsDirectory=vault2077$/m);
  assert.match(failureNotifier, /^StandardOutput=append:\/var\/log\/vault2077\/failures\.log$/m);
  assert.match(failureNotifier, /ExecStart=\/usr\/bin\/printf .*vault2077-alert.*unit.*%i.*status.*failed/);
  assert.match(productionLogrotate, /^\s*copytruncate$/m);
  assert.match(productionLogrotate, /^\s*maxsize 10M$/m);
  assert.doesNotMatch(productionLogrotate, /^\s*size\s/m);
  assert.match(productionLogrotate, /^\s*su root root$/m);
});

test("OPC payment outbox and retention run on the domestic business clock", () => {
  assert.match(opcOrderMaintenanceTimer, /^OnUnitActiveSec=60s$/m);
  assert.match(opcOrderMaintenanceTimer, /^Persistent=true$/m);
  assert.match(opcOrderMaintenanceService, /npm run opc:maintain-orders/);
});
