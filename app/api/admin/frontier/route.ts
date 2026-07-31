import { NextRequest } from "next/server";
import {
  adminAccessErrorResponse,
  authenticateAdminRequest,
  authenticatedAdminJson,
  configuredAdminReauthenticationUrl,
} from "@/lib/admin-access";
import { hasRecentAdminReauthentication } from "@/lib/admin-session-store";
import {
  currentSeason,
  getFrontierSeasonConfiguration,
  listAdminPrizeDonations,
  listAdminSubmissions,
  listVerifiedSubmissions,
  publishFrontierSeasonReward,
  saveFrontierSeasonRewardDraft,
  setPrizeDonationStatus,
  updateSubmissionStars,
} from "@/lib/frontier-store";
import { inspectGitHubRepository } from "@/lib/github";
import { recordAuditEvent } from "@/lib/security-audit";

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
      return authenticatedAdminJson(access, {
        refreshed,
        failed,
        submissions: await listAdminSubmissions(),
        donations: await listAdminPrizeDonations(),
        seasonConfiguration: await getFrontierSeasonConfiguration(),
      });
    }
    if (body.action === "save-season-reward" || body.action === "publish-season-reward") {
      const season = currentSeason().code;
      targetId = season;
      if (body.action === "save-season-reward") {
        if (typeof body.officialReward !== "string") {
          return authenticatedAdminJson(access, { error: "请填写本赛季真实官方奖励。" }, { status: 400 });
        }
        await saveFrontierSeasonRewardDraft(season, body.officialReward);
      } else {
        await publishFrontierSeasonReward(season);
      }
      const seasonConfiguration = await getFrontierSeasonConfiguration(season);
      await recordAuditEvent({
        actorHash,
        action: `admin.frontier.${body.action}`,
        targetType: "frontier-season",
        targetId: season,
        result: "success",
        diff: {
          status: seasonConfiguration.status,
          officialReward: seasonConfiguration.officialReward,
          rewardProvider: seasonConfiguration.rewardProvider,
          rewardProcessOpenWithinDays: seasonConfiguration.rewardProcessOpenWithinDays,
        },
      });
      return authenticatedAdminJson(access, {
        submissions: await listAdminSubmissions(),
        donations: await listAdminPrizeDonations(),
        seasonConfiguration,
      });
    }
    if (changesDonation && typeof body.donationId === "string") {
      const statusAction = body.action === "confirm-donation" ? "confirm" : body.action === "reject-donation" ? "reject" : "withdraw";
      await setPrizeDonationStatus(body.donationId, statusAction);
      await recordAuditEvent({
        actorHash,
        action: `admin.frontier.${body.action}`,
        targetType: "prize-donation",
        targetId: body.donationId,
        result: "success",
        diff: { statusAction },
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
    const message = error instanceof Error ? error.message : "暂时无法刷新 Star。";
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
