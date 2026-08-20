import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createPendingSubmission,
  findSeasonSubmission,
  FrontierSubmissionConflictError,
  removePendingSubmission,
  updatePendingSubmissionRepository,
} from "@/lib/frontier/submissions";
import { currentSeason } from "@/lib/frontier/rankings";
import { getFrontierSeasonLaunchState } from "@/lib/frontier/season";
import { enqueueFrontierObservationTask } from "@/lib/frontier-public-tasks";
import { repositoryEligibilityError } from "@/lib/frontier-service";
import { inspectGitHubRepository, parseGitHubRepository } from "@/lib/github";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const season = currentSeason();
  if (!(await getFrontierSeasonLaunchState(season.code)).writesEnabled) {
    return NextResponse.json({ error: "边境计划报名尚未开放，请等待管理后台发布本赛季奖励。" }, { status: 503 });
  }
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  if (!(await withinDurableRateLimit(`frontier:challenge:${clientHash}`, 8, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "当前请求次数过多，请稍后再试。" }, { status: 429 });
  }

  try {
    const body = await request.json() as { repo?: unknown; email?: unknown; note?: unknown; rulesAccepted?: unknown };
    if (typeof body.repo !== "string" || typeof body.email !== "string" || typeof body.note !== "string" || body.rulesAccepted !== true) {
      return NextResponse.json({ error: "提交信息格式无效。" }, { status: 400 });
    }
    const email = body.email.trim().toLowerCase();
    const note = body.note.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "请输入用于获奖通知的有效邮箱。" }, { status: 400 });
    }
    if (note.length < 6 || note.length > 180) {
      return NextResponse.json({ error: "一句话项目说明需为 6–180 个字符。" }, { status: 400 });
    }

    let owner: string;
    let repo: string;
    try {
      ({ owner, repo } = parseGitHubRepository(body.repo));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "仓库地址无效。" }, { status: 400 });
    }
    const existing = await findSeasonSubmission(owner, repo, season.code);
    if (existing?.status === "verified") {
      return NextResponse.json({
        alreadyVerified: true,
        id: existing.id,
        season: season.code,
        seasonName: season.name,
        repository: existing.repository,
        baselineStars: existing.baselineStars,
        verifiedAt: existing.verifiedAt,
      });
    }
    const challenge = randomBytes(24).toString("base64url");
    const submission = await createPendingSubmission({
      owner,
      repo,
      email,
      note,
      defaultBranch: "",
      challenge,
      rulesAccepted: true,
    });
    let directInspection = false;
    try {
      const repository = await inspectGitHubRepository(owner, repo);
      const eligibilityError = repositoryEligibilityError(repository);
      if (eligibilityError) {
        await removePendingSubmission(submission.id);
        return NextResponse.json({ error: eligibilityError }, { status: 400 });
      }
      await updatePendingSubmissionRepository(submission.id, { defaultBranch: repository.defaultBranch });
      directInspection = true;
    } catch (error) {
      if (error instanceof Error && error.message.includes("没有找到")) {
        await removePendingSubmission(submission.id);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      await enqueueFrontierObservationTask({
        kind: "inspect_submission",
        season: submission.season,
        submissionId: submission.id,
        owner,
        repo,
        expiresAt: submission.challengeExpiresAt,
      });
    }
    const filePath = `.vault2077/season-${season.code}.json`;
    return NextResponse.json({
      id: submission.id,
      season: season.code,
      seasonName: season.name,
      repository: submission.repository,
      filePath,
      expiresAt: submission.challengeExpiresAt,
      verificationStatus: directInspection ? "ready" : "pending_inspection",
      payload: {
        platform: "vault2077",
        season: season.code,
        repository: submission.repository,
        challenge,
        issuedAt: submission.createdAt,
      },
    }, { status: directInspection ? 201 : 202 });
  } catch (error) {
    if (error instanceof FrontierSubmissionConflictError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error("Frontier repository challenge creation failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json({ error: "暂时无法创建验证文件。" }, { status: 502 });
  }
}
