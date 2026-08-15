import { NextRequest, NextResponse } from "next/server";
import {
  CORRECTION_ISSUE_TYPES,
  createCorrectionReport,
  type CorrectionIssueType,
} from "@/lib/correction-store";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";
import { validateCorrectionFields } from "@/lib/correction-validation";

export const runtime = "nodejs";

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
    const evidenceUrl = typeof body.evidenceUrl === "string" ? body.evidenceUrl.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const fieldErrors = validateCorrectionFields({ recordId, pageUrl, description, evidenceUrl, email });
    if (
      !CORRECTION_ISSUE_TYPES.includes(issueType)
      || (recordType !== "event" && recordType !== "information")
      || Object.keys(fieldErrors).length > 0
    ) {
      return NextResponse.json({
        error: "请修正标记的字段后重新提交。",
        fieldErrors,
      }, { status: 400 });
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
