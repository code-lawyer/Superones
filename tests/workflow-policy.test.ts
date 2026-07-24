import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("../.github/workflows/collect-content.yml", import.meta.url),
  "utf8",
);

test("GitHub Actions schedules four lanes at the approved Beijing cadence", () => {
  for (const cron of [
    "5 */2 * * *",
    "55 */2 * * *",
    "25 11,23 * * *",
    "55 11,23 * * *",
  ]) {
    assert.ok(workflow.includes(`cron: "${cron}"`), cron);
  }
  assert.match(workflow, /group: vault2077-acquisition/);
  assert.match(workflow, /cancel-in-progress: false/);
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
