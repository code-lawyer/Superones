import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  adminSessionAnonymousId,
  readAdminSession,
  refreshAdminSession,
} from "@/lib/admin-auth";
import { configuredAcquisitionReceiver } from "@/lib/acquisition-inbox";
import { getStoredContent } from "@/lib/content-store";
import { closeCorrectionReport, listAdminCorrectionReports } from "@/lib/correction-store";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = readAdminSession(request.cookies.get(ADMIN_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "需要后台登录。" }, { status: 401 });
  }
  const [content, queue, corrections] = await Promise.all([
    getStoredContent(),
    configuredAcquisitionReceiver().stats(),
    listAdminCorrectionReports(),
  ]);
  const response = NextResponse.json({ state: content.state, queue, corrections });
  response.cookies.set(ADMIN_COOKIE, refreshAdminSession(session), adminCookieOptions);
  return response;
}

export async function POST(request: NextRequest) {
  const session = readAdminSession(request.cookies.get(ADMIN_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "需要后台登录。" }, { status: 401 });
  const actorHash = adminSessionAnonymousId(session);
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
      return NextResponse.json({ error: "关闭纠错需要明确确认和 6–500 字处理说明。" }, { status: 400 });
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
    const response = NextResponse.json({ corrections: await listAdminCorrectionReports() });
    response.cookies.set(ADMIN_COOKIE, refreshAdminSession(session), adminCookieOptions);
    return response;
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
    return NextResponse.json({ error: reason }, { status: 500 });
  }
}
