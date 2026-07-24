import "server-only";

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { getStoredContent } from "./content-store";
import { getSicStoredContent } from "./sic-content-store";
import type { EventRecord, InformationItem } from "./types";
import type { SicContentItem } from "./sic-content-types";

export const PIPELINE_SECTIONS = [
  "information",
  "statements",
  "sic",
  "rankings",
] as const;

export const PIPELINE_SOURCE_STATUSES = [
  "succeeded",
  "partial",
  "empty",
  "failed",
] as const;

export type PipelineSection = (typeof PIPELINE_SECTIONS)[number];
export type PipelineSourceStatus = (typeof PIPELINE_SOURCE_STATUSES)[number];

export type PipelineSourceHealth = {
  sourceId: string;
  name: string;
  section: PipelineSection | "projects" | "other";
  connector: string;
  originPlatform: string;
  status: PipelineSourceStatus;
  recordCount: number;
  durationMs: number | null;
  errorMessage?: string;
  registered: boolean;
};

type AcquisitionReport = {
  runId: string;
  registryRevision: string;
  collectedFrom: string;
  collectedUntil: string;
  collectedAt: string;
  batches: number;
  records: number;
  recordsByKind: Record<string, number>;
  sources: number;
  sourceStatus: Record<PipelineSourceStatus, number>;
  sourceReports: PipelineSourceHealth[];
  collectionLimits: {
    lookbackHours: number;
    maxItemsPerSource: number;
  };
  processor: {
    provider: string | null;
    model: string | null;
    durationMs: number | null;
  };
  receipts: unknown[];
  processing: {
    ok?: boolean;
    processed?: Array<{
      result?: Record<string, number>;
    }>;
    failed?: unknown[];
    queue?: {
      pending?: number;
      processing?: number;
      succeeded?: number;
      failed?: number;
    };
  } | null;
};

export type PipelineRunSnapshot = {
  available: boolean;
  report: AcquisitionReport | null;
  sections: Record<PipelineSection, PipelineSourceHealth[]>;
  queue: {
    pending: number;
    processing: number;
    succeeded: number;
    failed: number;
  };
  retryAttempts: number;
  processingTotals: Record<string, number>;
  information: InformationItem[];
  statements: InformationItem[];
  events: EventRecord[];
  sicItems: SicContentItem[];
  quarantineCount: number;
};

function isReport(value: unknown): value is AcquisitionReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const report = value as Partial<AcquisitionReport>;
  return (
    typeof report.runId === "string"
    && typeof report.records === "number"
    && typeof report.sources === "number"
    && Array.isArray(report.sourceReports)
    && report.sourceReports.every((item) => (
      item
      && typeof item.sourceId === "string"
      && typeof item.name === "string"
      && typeof item.status === "string"
      && typeof item.recordCount === "number"
    ))
  );
}

function newest<T>(
  values: T[],
  date: (value: T) => string | null | undefined,
) {
  return [...values].sort(
    (left, right) => Date.parse(date(right) ?? "") - Date.parse(date(left) ?? ""),
  );
}

async function liveQueue(dataRoot: string) {
  const inbox = path.join(dataRoot, "acquisition-inbox");
  const files = await readdir(inbox).catch(() => []);
  const records = await Promise.all(files
    .filter((name) => name.endsWith(".json"))
    .map(async (name) => {
      const raw = await readFile(path.join(inbox, name), "utf8").catch(() => null);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { status?: unknown; attempts?: unknown };
      return (
        typeof parsed.status === "string"
        && ["pending", "processing", "succeeded", "failed"].includes(parsed.status)
      )
        ? {
            status: parsed.status as "pending" | "processing" | "succeeded" | "failed",
            attempts: typeof parsed.attempts === "number" ? parsed.attempts : 0,
          }
        : null;
    }));
  const valid = records.filter((record): record is NonNullable<typeof record> => Boolean(record));
  if (valid.length === 0) return null;
  return {
    queue: {
      pending: valid.filter((record) => record.status === "pending").length,
      processing: valid.filter((record) => record.status === "processing").length,
      succeeded: valid.filter((record) => record.status === "succeeded").length,
      failed: valid.filter((record) => record.status === "failed").length,
    },
    retryAttempts: valid.reduce((sum, record) => sum + Math.max(0, record.attempts - 1), 0),
  };
}

export async function getPipelineRunSnapshot(): Promise<PipelineRunSnapshot> {
  const dataRoot = process.env.VAULT2077_DATA_DIR
    ? path.resolve(process.env.VAULT2077_DATA_DIR)
    : path.join(process.cwd(), "data");
  const [stored, sic, rawReport, liveProcessing] = await Promise.all([
    getStoredContent(),
    getSicStoredContent(),
    readFile(path.join(dataRoot, "pipeline-report.json"), "utf8").catch(() => null),
    liveQueue(dataRoot),
  ]);
  let report: AcquisitionReport | null = null;
  if (rawReport) {
    const parsed = JSON.parse(rawReport) as unknown;
    if (isReport(parsed)) report = parsed;
  }

  const sections = Object.fromEntries(
    PIPELINE_SECTIONS.map((section) => [
      section,
      (report?.sourceReports ?? []).filter((item) => item.registered && item.section === section),
    ]),
  ) as Record<PipelineSection, PipelineSourceHealth[]>;
  const processingTotals: Record<string, number> = {};
  for (const batch of report?.processing?.processed ?? []) {
    for (const [kind, count] of Object.entries(batch.result ?? {})) {
      if (typeof count === "number") {
        processingTotals[kind] = (processingTotals[kind] ?? 0) + count;
      }
    }
  }

  const information = newest(
    stored.information.filter((item) => item.sourceStream !== "statements"),
    (item) => item.publishedAt ?? item.discoveredAt,
  );
  const statements = newest(
    stored.information.filter((item) => item.sourceStream === "statements"),
    (item) => item.publishedAt ?? item.discoveredAt,
  );
  const reportQueue = report?.processing?.queue;
  const queue = liveProcessing?.queue ?? {
    pending: reportQueue?.pending ?? 0,
    processing: reportQueue?.processing ?? 0,
    succeeded: reportQueue?.succeeded ?? 0,
    failed: reportQueue?.failed ?? 0,
  };

  return {
    available: Boolean(report),
    report,
    sections,
    queue,
    retryAttempts: liveProcessing?.retryAttempts ?? 0,
    processingTotals,
    information,
    statements,
    events: newest(stored.events, (item) => item.updated),
    sicItems: newest(sic.items, (item) => item.publishedAt ?? item.collectedAt),
    quarantineCount: stored.quarantine.length,
  };
}
