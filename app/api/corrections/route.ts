import { NextRequest, NextResponse } from "next/server";
import {
  CORRECTION_ISSUE_TYPES,
  createCorrectionReport,
  type CorrectionIssueType,
} from "@/lib/correction-store";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";

export const runtime = "nodejs";

function httpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 16_384) {
    return NextResponse.json({ error: "纠错请求超过大小限制。" }, { status: 413 });
  }
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  if (!(await withinDurableRateLimit(`corrections:${clientHash}`, 5, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: "今天提交的纠错较多，请稍后再试。" }, { status: 429 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    const issueType = body.issueType as CorrectionIssueType;
    const recordType = body.recordType;
    const recordId = typeof body.recordId === "string" ? body.recordId.trim() : "";
    const pageUrl = typeof body.pageUrl === "string" ? body.pageUrl.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const evidenceUrl = httpsUrl(body.evidenceUrl);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (
      !CORRECTION_ISSUE_TYPES.includes(issueType)
      || (recordType !== "event" && recordType !== "information")
      || recordId.length < 1
      || recordId.length > 180
      || pageUrl.length > 500
      || description.length < 12
      || description.length > 1_500
      || !evidenceUrl
      || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ) {
      return NextResponse.json({ error: "请完整填写记录、问题说明和 HTTPS 原始依据。" }, { status: 400 });
    }
    const result = await createCorrectionReport({
      issueType,
      recordType,
      recordId,
      pageUrl,
      description,
      evidenceUrl,
      ...(email ? { email } : {}),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Correction submission failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "暂时无法提交纠错。" },
      { status: 500 },
    );
  }
}
