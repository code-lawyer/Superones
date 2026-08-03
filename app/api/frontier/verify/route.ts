import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
  FRONTIER_PUBLIC_RANKING_CACHE_TAG,
  FRONTIER_PUBLIC_SNAPSHOT_CACHE_TAG,
} from "@/lib/cache-tags";
import { seasonFromCode } from "@/lib/frontier-domain";
import {
  challengeMatches,
  getFrontierSeasonLaunchState,
  getSubmission,
  markSubmissionVerified,
  updatePendingSubmissionRepository,
} from "@/lib/frontier-store";
import { repositoryEligibilityError } from "@/lib/frontier-service";
import { inspectGitHubRepository, readGitHubChallengeFile } from "@/lib/github";
import { enqueueFrontierObservationTask } from "@/lib/frontier-public-tasks";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!(await getFrontierSeasonLaunchState()).writesEnabled) {
    return NextResponse.json({ error: "边境计划报名尚未开放，当前不能验证报名。" }, { status: 503 });
  }
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  if (!(await withinDurableRateLimit(`frontier:verify:${clientHash}`, 12, 60 * 60 * 1000))) {
    return NextResponse.json({ error: "当前验证次数过多，请稍后再试。" }, { status: 429 });
  }

  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") return NextResponse.json({ error: "缺少报名记录。" }, { status: 400 });
    const submission = await getSubmission(body.id);
    if (!submission) {
      return NextResponse.json({
        error: "没有找到对应的报名记录，请重新报名。",
      }, { status: 404 });
    }
    if (submission.status === "verified") {
      return NextResponse.json({ repository: submission.repository, baselineStars: submission.baselineStars, verifiedAt: submission.verifiedAt });
    }
    if (submission.status === "rejected") {
      return NextResponse.json({
        rejected: true,
        error: submission.verificationError ?? "仓库未通过参赛资格核验，请修正后重新报名。",
        repository: submission.repository,
      }, { status: 422 });
    }
    if (submission.status !== "pending") return NextResponse.json({ error: "该报名记录当前不能验证。" }, { status: 409 });
    if (new Date(seasonFromCode(submission.season).endsAt).getTime() < Date.now()) {
      return NextResponse.json({ error: "该赛季已经进入结算，不能继续验证报名。" }, { status: 410 });
    }
    if (new Date(submission.challengeExpiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: "挑战码已过期，请返回上一步重新生成验证文件。" }, { status: 410 });
    }

    const filePath = `.vault2077/season-${submission.season}.json`;
    let defaultBranch = submission.defaultBranch;
    if (!defaultBranch) {
      try {
        const repository = await inspectGitHubRepository(submission.owner, submission.repo);
        const eligibilityError = repositoryEligibilityError(repository);
        if (eligibilityError) return NextResponse.json({ error: eligibilityError }, { status: 400 });
        defaultBranch = repository.defaultBranch;
      } catch {
        await enqueueFrontierObservationTask({
          kind: "verify_submission",
          season: submission.season,
          submissionId: submission.id,
          owner: submission.owner,
          repo: submission.repo,
          expiresAt: submission.challengeExpiresAt,
        });
        return NextResponse.json({ pending: true, repository: submission.repository }, { status: 202 });
      }
    }
    let payload: { platform?: unknown; season?: unknown; repository?: unknown; challenge?: unknown };
    try {
      payload = JSON.parse(await readGitHubChallengeFile(submission.owner, submission.repo, defaultBranch, filePath)) as typeof payload;
    } catch (error) {
      if (error instanceof Error && error.message.includes("没有找到")) {
        return NextResponse.json({ error: `还未在默认分支找到 ${filePath}，请提交文件后再验证。` }, { status: 400 });
      }
      await enqueueFrontierObservationTask({
        kind: "verify_submission",
        season: submission.season,
        submissionId: submission.id,
        owner: submission.owner,
        repo: submission.repo,
        expiresAt: submission.challengeExpiresAt,
      });
      return NextResponse.json({ pending: true, repository: submission.repository }, { status: 202 });
    }
    if (payload.platform !== "vault2077" || payload.season !== submission.season || payload.repository !== submission.repository || typeof payload.challenge !== "string" || !challengeMatches(payload.challenge, submission.challengeHash)) {
      return NextResponse.json({ error: "验证文件内容与本次报名不匹配。请使用本页生成的内容重新提交。" }, { status: 400 });
    }

    let repository;
    try {
      repository = await inspectGitHubRepository(submission.owner, submission.repo);
    } catch {
      await enqueueFrontierObservationTask({
        kind: "verify_submission",
        season: submission.season,
        submissionId: submission.id,
        owner: submission.owner,
        repo: submission.repo,
        expiresAt: submission.challengeExpiresAt,
      });
      return NextResponse.json({ pending: true, repository: submission.repository }, { status: 202 });
    }
    const eligibilityError = repositoryEligibilityError(repository);
    if (eligibilityError) return NextResponse.json({ error: eligibilityError }, { status: 400 });
    await updatePendingSubmissionRepository(submission.id, { defaultBranch: repository.defaultBranch });
    const verified = await markSubmissionVerified(submission.id, repository.stars);
    revalidateTag(FRONTIER_PUBLIC_SNAPSHOT_CACHE_TAG, { expire: 0 });
    revalidateTag(FRONTIER_PUBLIC_RANKING_CACHE_TAG, { expire: 0 });
    return NextResponse.json({ repository: verified.repository, baselineStars: verified.baselineStars, verifiedAt: verified.verifiedAt, keepFileUntil: seasonFromCode(submission.season).endsAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂时无法验证仓库。";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
