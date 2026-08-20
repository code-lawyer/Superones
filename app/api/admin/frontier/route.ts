import { NextRequest } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminJson,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import {
  getFrontierSeasonConfiguration,
  listAdminPrizeDonations,
  listAdminSubmissions,
  publishFrontierSeasonReward,
  saveFrontierSeasonRewardDraft,
  setPrizeDonationStatus,
} from "@/lib/frontier/admin";
import { currentSeason } from "@/lib/frontier/rankings";
import { recordAuditEvent } from "@/lib/security-audit";
import { withPersistenceTransaction } from "@/lib/state-document-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const access = await authenticateAdminRequest(request);
    return authenticatedAdminJson(access, {
      submissions: await listAdminSubmissions(),
      donations: await listAdminPrizeDonations(),
      seasonConfiguration: await getFrontierSeasonConfiguration(),
    });
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  let access;
  try {
    access = await authenticateAdminRequest(request, { mutation: true });
  } catch (error) {
    return adminAccessErrorResponse(error);
  }
  const actorHash = access.session.actorHash;
  let action = "unknown";
  let targetId = "unknown";
  try {
    const body = await request.json() as { action?: unknown; donationId?: unknown; officialReward?: unknown; confirm?: unknown };
    action = typeof body.action === "string" ? body.action : "unknown";
    targetId = typeof body.donationId === "string" ? body.donationId : "frontier";
    const changesDonation = ["confirm-donation", "reject-donation", "withdraw-donation"].includes(action);
    const publishesSeason = action === "publish-season-reward";
    if ((changesDonation || publishesSeason) && !hasRecentAdminReauthentication(access.session)) {
      await recordAuditEvent({
        actorHash,
        action: `admin.frontier.${action}`,
        targetType: publishesSeason ? "frontier-season" : "prize-donation",
        targetId,
        result: "rejected",
        reason: "recent-reauthentication-required",
      });
      return authenticatedAdminJson(access, {
        error: publishesSeason ? "发布本赛季奖励前需要重新验证管理员身份。" : "变更奖品状态前需要重新验证管理员身份。",
        code: "ADMIN_REAUTH_REQUIRED",
        reauthenticationUrl: configuredAdminReauthenticationUrl(),
      }, { status: 403 });
    }
    if (body.confirm !== true) {
      await recordAuditEvent({
        actorHash,
        action: `admin.frontier.${action}`,
        targetType: changesDonation ? "prize-donation" : "frontier",
        targetId,
        result: "rejected",
        reason: "confirmation-required",
      });
      return authenticatedAdminJson(access, { error: "该后台写操作需要明确二次确认。" }, { status: 409 });
    }
    if (body.action === "save-season-reward" || body.action === "publish-season-reward") {
      const season = currentSeason().code;
      targetId = season;
      if (body.action === "save-season-reward" && typeof body.officialReward !== "string") {
        await recordAuditEvent({
          actorHash,
          action: "admin.frontier.save-season-reward",
          targetType: "frontier-season",
          targetId: season,
          result: "rejected",
          reason: "official-reward-required",
        });
        return authenticatedAdminJson(access, { error: "请填写本赛季真实官方奖励。" }, { status: 400 });
      }
      const seasonConfiguration = await withPersistenceTransaction(async () => {
        if (body.action === "save-season-reward") {
          await saveFrontierSeasonRewardDraft(season, body.officialReward as string);
        } else {
          await publishFrontierSeasonReward(season);
        }
        const updated = await getFrontierSeasonConfiguration(season);
        await recordAuditEvent({
          actorHash,
          action: `admin.frontier.${body.action}`,
          targetType: "frontier-season",
          targetId: season,
          result: "success",
          diff: {
            status: updated.status,
            officialReward: updated.officialReward,
            rewardProvider: updated.rewardProvider,
            rewardProcessOpenWithinDays: updated.rewardProcessOpenWithinDays,
          },
        });
        return updated;
      });
      return authenticatedAdminJson(access, {
        submissions: await listAdminSubmissions(),
        donations: await listAdminPrizeDonations(),
        seasonConfiguration,
      });
    }
    if (changesDonation && typeof body.donationId === "string") {
      const statusAction = body.action === "confirm-donation" ? "confirm" : body.action === "reject-donation" ? "reject" : "withdraw";
      await withPersistenceTransaction(async () => {
        await setPrizeDonationStatus(body.donationId as string, statusAction);
        await recordAuditEvent({
          actorHash,
          action: `admin.frontier.${body.action}`,
          targetType: "prize-donation",
          targetId: body.donationId as string,
          result: "success",
          diff: { statusAction },
        });
      });
      return authenticatedAdminJson(access, {
        submissions: await listAdminSubmissions(),
        donations: await listAdminPrizeDonations(),
        seasonConfiguration: await getFrontierSeasonConfiguration(),
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
    return authenticatedAdminJson(access, { error: "不支持的后台操作。" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂时无法完成边境计划后台操作。";
    await recordAuditEvent({
      actorHash,
      action: `admin.frontier.${action}`,
      targetType: action.includes("donation") ? "prize-donation" : "frontier",
      targetId,
      result: "failed",
      reason: message.slice(0, 200),
    }).catch(() => undefined);
    return authenticatedAdminJson(access, { error: message }, { status: 502 });
  }
}
