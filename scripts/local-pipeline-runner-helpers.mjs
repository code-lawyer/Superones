import path from "node:path";

export const PIPELINE_LANES = [
  "information",
  "roadside",
  "sic",
  "rankings",
];

export function selectedPipelineLanes(environment = process.env) {
  const configured = (environment.VAULT2077_LOCAL_LANES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length === 0) return [...PIPELINE_LANES];

  const lanes = [...new Set(configured)];
  const invalid = lanes.filter((lane) => !PIPELINE_LANES.includes(lane));
  if (invalid.length > 0) {
    throw new Error(`Unknown local pipeline lanes: ${invalid.join(", ")}.`);
  }
  return lanes;
}

export function localUvEnvironment(root, runRoot, environment = process.env) {
  return {
    UV_CACHE_DIR: environment.UV_CACHE_DIR
      ?? path.join(runRoot, "uv-cache"),
    UV_PYTHON_INSTALL_DIR: environment.UV_PYTHON_INSTALL_DIR
      ?? path.join(root, ".collector-output", "uv-python"),
    UV_PYTHON_PREFERENCE: environment.UV_PYTHON_PREFERENCE
      ?? "only-managed",
  };
}

export function assertCollectorReport(lane, exitCode, report) {
  if (exitCode !== 0) {
    throw new Error(`${lane} collector exited with ${exitCode}.`);
  }
  if (!report || report.lane !== lane) {
    throw new Error(
      `Collector report lane mismatch: expected ${lane}, received ${report?.lane ?? "missing"}.`,
    );
  }
}
