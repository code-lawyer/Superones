import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminCookieOptions,
  adminSessionAnonymousId,
  readAdminSession,
  refreshAdminSession,
  type AdminSession,
} from "@/lib/admin-auth";
import { listAdminPrizeDonations, listAdminSubmissions, listVerifiedSubmissions, setPrizeDonationStatus, updateSubmissionStars } from "@/lib/frontier-store";
import { inspectGitHubRepository } from "@/lib/github";
import { recordAuditEvent } from "@/lib/security-audit";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  return readAdminSession(request.cookies.get(ADMIN_COOKIE)?.value);
}

function authenticatedJson(session: AdminSession, body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.cookies.set(ADMIN_COOKIE, refreshAdminSession(session), adminCookieOptions);
  return response;
}

export async function GET(request: NextRequest) {
  const session = authorized(request);
  if (!session) return NextResponse.json({ error: "需要后台登录。" }, { status: 401 });
  return authenticatedJson(session, {
    submissions: await listAdminSubmissions(),
    donations: await listAdminPrizeDonations(),
  });
}

export async function POST(request: NextRequest) {
  const session = authorized(request);
  if (!session) return NextResponse.json({ error: "需要后台登录。" }, { status: 401 });
  const actorHash = adminSessionAnonymousId(session);
  let action = "unknown";
  let targetId = "unknown";
  try {
    const body = await request.json() as { action?: unknown; donationId?: unknown; confirm?: unknown };
    action = typeof body.action === "string" ? body.action : "unknown";
    targetId = typeof body.donationId === "string" ? body.donationId : "frontier";
    if (body.confirm !== true) {
      await recordAuditEvent({
        actorHash,
        action: `admin.frontier.${action}`,
        targetType: action.includes("donation") ? "prize-donation" : "frontier",
        targetId,
        result: "rejected",
        reason: "confirmation-required",
      });
      return authenticatedJson(session, { error: "该后台写操作需要明确二次确认。" }, { status: 409 });
    }
    if (body.action === "refresh-stars") {
      const verified = await listVerifiedSubmissions();
      const result = await Promise.allSettled(verified.map(async (submission) => {
        const repository = await inspectGitHubRepository(submission.owner, submission.repo);
        await updateSubmissionStars(submission.id, repository.stars);
        return submission.repository;
      }));
      const refreshed = result.filter((item) => item.status === "fulfilled").length;
      const failed = result.length - refreshed;
      await recordAuditEvent({
        actorHash,
        action: "admin.frontier.refresh-stars",
        targetType: "frontier",
        targetId: "current-season",
        result: failed ? "failed" : "success",
        reason: failed ? `${failed} repositories failed` : undefined,
        diff: { refreshed, failed },
      });
      return authenticatedJson(session, {
        refreshed,
        failed,
        submissions: await listAdminSubmissions(),
        donations: await listAdminPrizeDonations(),
      });
    }
    if (["confirm-donation", "reject-donation", "withdraw-donation"].includes(String(body.action)) && typeof body.donationId === "string") {
      const action = body.action === "confirm-donation" ? "confirm" : body.action === "reject-donation" ? "reject" : "withdraw";
      await setPrizeDonationStatus(body.donationId, action);
      await recordAuditEvent({
        actorHash,
        action: `admin.frontier.${body.action}`,
        targetType: "prize-donation",
        targetId: body.donationId,
        result: "success",
        diff: { statusAction: action },
      });
      return authenticatedJson(session, {
        submissions: await listAdminSubmissions(),
        donations: await listAdminPrizeDonations(),
      });
    }
    await recordAuditEvent({
      actorHash,
      action: `admin.frontier.${action}`,
      targetType: "frontier",
      targetId,
      result: "rejected",
      reason: "unsupported-action",
    });
    return authenticatedJson(session, { error: "不支持的后台操作。" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂时无法刷新 Star。";
    await recordAuditEvent({
      actorHash,
      action: `admin.frontier.${action}`,
      targetType: action.includes("donation") ? "prize-donation" : "frontier",
      targetId,
      result: "failed",
      reason: message.slice(0, 200),
    }).catch(() => undefined);
    return authenticatedJson(session, { error: message }, { status: 502 });
  }
}
