import { createHash } from "node:crypto";
import { readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AcquisitionLane, AcquisitionRunMode } from "./acquisition-contract.ts";
import {
  sanitizeSensitiveFailureMessage,
  sensitiveEvidenceRuleIds,
  type SensitiveEvidenceRuleId,
} from "./acquisition-sensitive-evidence.ts";

export type AcquisitionEvidenceFile = {
  path: string;
  bytes: number;
  sha256: string;
};

type AcquisitionRunIdentity = {
  outputRoot: string;
  runId: string;
  lane: AcquisitionLane;
  runMode: AcquisitionRunMode;
  scheduleId: string;
  startedAt?: string;
};

export type AcquisitionRunManifest = {
  schemaVersion: 1;
  runId: string;
  lane: AcquisitionLane;
  runMode: AcquisitionRunMode;
  scheduleId: string;
  status: "started" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  files: AcquisitionEvidenceFile[];
  failure: { name: string; message: string } | null;
};

const manifestName = "run-manifest.json";
const reportName = "acquisition-report.json";

type SensitiveEvidenceFinding = {
  path: string;
  ruleId: SensitiveEvidenceRuleId;
};

function sensitiveEvidenceFindings(files: ReadonlyMap<string, string>): SensitiveEvidenceFinding[] {
  return [...files].flatMap(([filePath, body]) => sensitiveEvidenceRuleIds(body)
    .map((ruleId) => ({ path: filePath, ruleId })));
}

function assertSensitiveEvidenceSafe(files: ReadonlyMap<string, string>) {
  const findings = sensitiveEvidenceFindings(files);
  if (findings.length === 0) return;
  const diagnostics = findings.map(({ path: filePath, ruleId }) => `${filePath}:${ruleId}`).join(", ");
  throw new Error(`采集证据包含疑似敏感凭据，拒绝处理（${diagnostics}）。`);
}

export function validateAcquisitionPayloadForDelivery(filePath: string, body: string) {
  assertSensitiveEvidenceSafe(new Map([[filePath, body]]));
}

function portablePath(root: string, target: string) {
  return path.relative(root, target).split(path.sep).join("/");
}

async function evidenceFiles(outputRoot: string) {
  const targets: string[] = [];
  const report = path.join(outputRoot, reportName);
  try {
    if ((await stat(report)).isFile()) targets.push(report);
  } catch {}
  const batchRoot = path.join(outputRoot, "acquisition-batches");
  try {
    for (const entry of await readdir(batchRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".json")) targets.push(path.join(batchRoot, entry.name));
    }
  } catch {}
  targets.sort((left, right) => portablePath(outputRoot, left).localeCompare(portablePath(outputRoot, right)));
  return Promise.all(targets.map(async (target): Promise<AcquisitionEvidenceFile> => {
    const body = await readFile(target);
    return {
      path: portablePath(outputRoot, target),
      bytes: body.byteLength,
      sha256: createHash("sha256").update(body).digest("hex"),
    };
  }));
}

async function persistManifest(outputRoot: string, manifest: AcquisitionRunManifest) {
  const target = path.join(outputRoot, manifestName);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

function sanitizedFailure(error: unknown) {
  const name = error instanceof Error ? error.name : "Error";
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = sanitizeSensitiveFailureMessage(rawMessage);
  return { name: name.slice(0, 120), message };
}

export function createAcquisitionRunEvidence(input: AcquisitionRunIdentity) {
  const startedAt = input.startedAt ?? new Date().toISOString();
  const base = {
    schemaVersion: 1 as const,
    runId: input.runId,
    lane: input.lane,
    runMode: input.runMode,
    scheduleId: input.scheduleId,
    startedAt,
  };
  return {
    begin() {
      return persistManifest(input.outputRoot, {
        ...base,
        status: "started",
        completedAt: null,
        files: [],
        failure: null,
      });
    },
    async complete(completedAt = new Date().toISOString()) {
      await persistManifest(input.outputRoot, {
        ...base,
        status: "completed",
        completedAt,
        files: await evidenceFiles(input.outputRoot),
        failure: null,
      });
    },
    async fail(error: unknown, completedAt = new Date().toISOString()) {
      await persistManifest(input.outputRoot, {
        ...base,
        status: "failed",
        completedAt,
        files: await evidenceFiles(input.outputRoot),
        failure: sanitizedFailure(error),
      });
    },
  };
}

export async function validateAcquisitionRunEvidence(outputRoot: string) {
  const manifestBody = await readFile(path.join(outputRoot, manifestName), "utf8");
  const manifest = JSON.parse(manifestBody) as AcquisitionRunManifest;
  if (manifest.schemaVersion !== 1) throw new Error("采集证据 manifest 版本无效。");
  if (!(["completed", "failed"] as const).includes(manifest.status as "completed" | "failed")) {
    throw new Error(`采集证据状态不可归档：${manifest.status}。`);
  }
  const currentFiles = await evidenceFiles(outputRoot);
  if (JSON.stringify(currentFiles) !== JSON.stringify(manifest.files)) {
    throw new Error("采集证据文件与 manifest 校验和不一致。");
  }
  const evidenceBodies = new Map(await Promise.all(currentFiles.map(async (file) => [
    file.path,
    await readFile(path.join(outputRoot, ...file.path.split("/")), "utf8"),
  ] as const)));
  const reportBody = evidenceBodies.get(reportName) ?? null;
  assertSensitiveEvidenceSafe(new Map([
    [manifestName, manifestBody],
    ...evidenceBodies,
  ]));
  if (manifest.status === "failed") {
    if (!manifest.failure?.message) throw new Error("失败采集证据缺少脱敏错误信息。");
    return manifest;
  }
  if (!currentFiles.some((file) => file.path === reportName)) throw new Error("采集证据缺少 acquisition-report.json。");
  if (!currentFiles.some((file) => file.path.startsWith("acquisition-batches/"))) {
    throw new Error("采集证据缺少不可变批次文件。");
  }
  const report = JSON.parse(reportBody!) as {
    schemaVersion?: unknown;
    runId?: unknown;
    lane?: unknown;
  };
  if (report.schemaVersion !== 1 || report.runId !== manifest.runId || report.lane !== manifest.lane) {
    throw new Error("采集报告与 manifest 身份不一致。");
  }
  return manifest;
}
