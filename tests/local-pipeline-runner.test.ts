import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  assertCollectorReport,
  localUvEnvironment,
  selectedPipelineLanes,
} from "../scripts/local-pipeline-runner-helpers.mjs";

test("local pipeline keeps uv cache and managed Python inside the run directory", () => {
  const root = path.resolve("C:/workspace/Vaulte2077");
  const runRoot = path.join(root, ".collector-output", "runs", "bootstrap");
  const environment = localUvEnvironment(root, runRoot, {});

  assert.equal(environment.UV_CACHE_DIR, path.join(runRoot, "uv-cache"));
  assert.equal(environment.UV_PYTHON_INSTALL_DIR, path.join(root, ".collector-output", "uv-python"));
  assert.equal(environment.UV_PYTHON_PREFERENCE, "only-managed");
});

test("local pipeline can run only the requested acquisition lanes", () => {
  assert.deepEqual(
    selectedPipelineLanes({ VAULT2077_LOCAL_LANES: "roadside,sic" }),
    ["roadside", "sic"],
  );
  assert.deepEqual(selectedPipelineLanes({}), [
    "information",
    "roadside",
    "sic",
    "rankings",
  ]);
});

test("local pipeline rejects a failed collector instead of reusing a stale report", () => {
  assert.throws(
    () => assertCollectorReport("roadside", 1, { lane: "information" }),
    /roadside collector exited with 1/,
  );
});

test("local pipeline rejects a collector report for the wrong lane", () => {
  assert.throws(
    () => assertCollectorReport("roadside", 0, { lane: "information" }),
    /expected roadside, received information/,
  );
});
