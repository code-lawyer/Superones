export const PIPELINE_LANES: readonly [
  "information",
  "roadside",
  "sic",
  "rankings",
];

export function selectedPipelineLanes(
  environment?: Record<string, string | undefined>,
): string[];

export function localUvEnvironment(
  root: string,
  runRoot: string,
  environment?: Record<string, string | undefined>,
): {
  UV_CACHE_DIR: string;
  UV_PYTHON_INSTALL_DIR: string;
  UV_PYTHON_PREFERENCE: string;
};

export function assertCollectorReport(
  lane: string,
  exitCode: number,
  report: { lane?: string } | null | undefined,
): void;
