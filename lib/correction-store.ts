import "server-only";

import { randomUUID } from "node:crypto";
import { decryptSensitiveText, encryptSensitiveText } from "./sensitive-data.ts";
import { mutateStateDocument, readStateDocument, type StateDocumentDefinition } from "./state-document-store.ts";

export const CORRECTION_ISSUE_TYPES = ["incorrect_merge", "factual_error", "source_unavailable"] as const;
export type CorrectionIssueType = (typeof CORRECTION_ISSUE_TYPES)[number];

type CorrectionReport = {
  id: string;
  issueType: CorrectionIssueType;
  recordType: "event" | "information";
  recordId: string;
  pageUrl: string;
  description: string;
  evidenceUrl: string;
  emailEncrypted: string | null;
  status: "open" | "closed";
  createdAt: string;
  closedAt: string | null;
  resolution: string | null;
};

type CorrectionStore = {
  version: 1;
  reports: CorrectionReport[];
};

const correctionDocument: StateDocumentDefinition<CorrectionStore> = {
  namespace: "corrections",
  fileName: "corrections.json",
  create: () => ({ version: 1, reports: [] }),
  parse: (value) => {
    const parsed = value as CorrectionStore;
    if (parsed.version !== 1 || !Array.isArray(parsed.reports)) throw new Error("纠错报告存储格式无效。");
    return parsed;
  },
};

export async function createCorrectionReport(input: {
  issueType: CorrectionIssueType;
  recordType: "event" | "information";
  recordId: string;
  pageUrl: string;
  description: string;
  evidenceUrl: string;
  email?: string;
}) {
  return mutateStateDocument(correctionDocument, (store) => {
    const report: CorrectionReport = {
      id: randomUUID(),
      ...input,
      emailEncrypted: input.email ? encryptSensitiveText(input.email) : null,
      status: "open",
      createdAt: new Date().toISOString(),
      closedAt: null,
      resolution: null,
    };
    store.reports.push(report);
    store.reports = store.reports.slice(-10_000);
    return { id: report.id, status: report.status, createdAt: report.createdAt };
  });
}

export async function listAdminCorrectionReports() {
  const store = await readStateDocument(correctionDocument);
  return store.reports
    .map(({ emailEncrypted, ...report }) => ({
      ...report,
      email: emailEncrypted ? decryptSensitiveText(emailEncrypted) : null,
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function closeCorrectionReport(id: string, resolution: string) {
  return mutateStateDocument(correctionDocument, (store) => {
    const report = store.reports.find((value) => value.id === id);
    if (!report) throw new Error("纠错报告不存在。");
    if (report.status === "closed") return report;
    report.status = "closed";
    report.closedAt = new Date().toISOString();
    report.resolution = resolution;
    return report;
  });
}
