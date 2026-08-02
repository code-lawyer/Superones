import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAcquisitionFailures } from "../lib/acquisition-failure-policy.ts";

test("isolated Follow Builders failures are reported without failing the workflow", () => {
  const result = evaluateAcquisitionFailures([
    { sourceId: "source-existing", status: "succeeded" },
    { sourceId: "source-follow-builders-x-swyx", status: "failed" },
    { sourceId: "latent-space-podcast", status: "failed" },
  ], new Map([
    ["source-existing", "blocking" as const],
    ["source-follow-builders-x-swyx", "isolated" as const],
    ["latent-space-podcast", "isolated" as const],
  ]));

  assert.equal(result.shouldFailWorkflow, false);
  assert.deepEqual(result.blockingSourceIds, []);
  assert.deepEqual(result.isolatedSourceIds, ["latent-space-podcast", "source-follow-builders-x-swyx"]);
});

test("ordinary and unknown source failures remain fail-closed", () => {
  const result = evaluateAcquisitionFailures([
    { sourceId: "source-existing", status: "failed" },
    { sourceId: "source-not-in-registry", status: "failed" },
    { sourceId: "source-follow-builders-x-swyx", status: "empty" },
  ], new Map([
    ["source-existing", "blocking" as const],
    ["source-follow-builders-x-swyx", "isolated" as const],
  ]));

  assert.equal(result.shouldFailWorkflow, true);
  assert.deepEqual(result.blockingSourceIds, ["source-existing", "source-not-in-registry"]);
  assert.deepEqual(result.isolatedSourceIds, []);
});
