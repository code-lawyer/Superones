import { NextRequest } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminJson,
} from "@/lib/admin-access";
import { configuredAcquisitionReceiver } from "@/lib/acquisition-inbox";
import { getStoredContent } from "@/lib/content-store";
import { closeCorrectionReport, listAdminCorrectionReports } from "@/lib/correction-store";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let access;
  try {
    access = await authenticateAdminRequest(request);
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
  const [content, queue, corrections] = await Promise.all([
    getStoredContent(),
    configuredAcquisitionReceiver().stats(),
    listAdminCorrectionReports(),
  ]);
  return authenticatedAdminJson(access, { state: content.state, queue, corrections });
}

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await authenticateAdminRequest(request, { mutation: true });
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
  const actorHash = access.session.actorHash;
  try {
    const body = await request.json() as {
      action?: unknown;
      correctionId?: unknown;
      resolution?: unknown;
      confirm?: unknown;
    };
    if (
      body.action !== "close-correction"
      || typeof body.correctionId !== "string"
      || typeof body.resolution !== "string"
      || body.resolution.trim().length < 6
      || body.resolution.trim().length > 500
      || body.confirm !== true
    ) {
      await recordAuditEvent({
        actorHash,
        action: "admin.correction.close",
        targetType: "correction",
        targetId: typeof body.correctionId === "string" ? body.correctionId : "unknown",
        result: "rejected",
        reason: "invalid-or-unconfirmed-request",
      });
      return authenticatedAdminJson(access, { error: "关闭纠错需要明确确认和 6–500 字处理说明。" }, { status: 400 });
    }
    await closeCorrectionReport(body.correctionId, body.resolution.trim());
    await recordAuditEvent({
      actorHash,
      action: "admin.correction.close",
      targetType: "correction",
      targetId: body.correctionId,
      result: "success",
      diff: { status: "closed" },
    });
    return authenticatedAdminJson(access, { corrections: await listAdminCorrectionReports() });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "暂时无法关闭纠错。";
    await recordAuditEvent({
      actorHash,
      action: "admin.correction.close",
      targetType: "correction",
      targetId: "unknown",
      result: "failed",
      reason: reason.slice(0, 200),
    }).catch(() => undefined);
    return authenticatedAdminJson(access, { error: reason }, { status: 500 });
  }
}
