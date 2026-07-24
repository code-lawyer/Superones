import { NextRequest, NextResponse } from "next/server";
import { seasonFromCode } from "@/lib/frontier-domain";
import { challengeMatches, getSubmission, markSubmissionVerified } from "@/lib/frontier-store";
import { repositoryEligibilityError } from "@/lib/frontier-service";
import { inspectGitHubRepository, readGitHubChallengeFile } from "@/lib/github";
import { withinRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(request: NextRequest) {
  if (!withinRateLimit(`frontier:verify:${clientKey(request)}`, 12, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "当前验证次数过多，请稍后再试。" }, { status: 429 });
  }

  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string") return NextResponse.json({ error: "缺少报名记录。" }, { status: 400 });
    const submission = await getSubmission(body.id);
    if (!submission) return NextResponse.json({ error: "没有找到对应的报名记录。" }, { status: 404 });
    if (submission.status === "verified") {
      return NextResponse.json({ repository: submission.repository, baselineStars: submission.baselineStars, verifiedAt: submission.verifiedAt });
    }
    if (submission.status !== "pending") return NextResponse.json({ error: "该报名记录当前不能验证。" }, { status: 409 });
    if (new Date(seasonFromCode(submission.season).endsAt).getTime() < Date.now()) {
      return NextResponse.json({ error: "该赛季已经进入结算，不能继续验证报名。" }, { status: 410 });
    }
    if (new Date(submission.challengeExpiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: "挑战码已过期，请返回上一步重新生成验证文件。" }, { status: 410 });
    }

    const filePath = `.vault2077/season-${submission.season}.json`;
    let payload: { platform?: unknown; season?: unknown; repository?: unknown; challenge?: unknown };
    try {
      payload = JSON.parse(await readGitHubChallengeFile(submission.owner, submission.repo, submission.defaultBranch, filePath)) as typeof payload;
    } catch {
      return NextResponse.json({ error: `还未在默认分支找到 ${filePath}，请提交文件后再验证。` }, { status: 400 });
    }
    if (payload.platform !== "vault2077" || payload.season !== submission.season || payload.repository !== submission.repository || typeof payload.challenge !== "string" || !challengeMatches(payload.challenge, submission.challengeHash)) {
      return NextResponse.json({ error: "验证文件内容与本次报名不匹配。请使用本页生成的内容重新提交。" }, { status: 400 });
    }

    const repository = await inspectGitHubRepository(submission.owner, submission.repo);
    const eligibilityError = repositoryEligibilityError(repository);
    if (eligibilityError) return NextResponse.json({ error: eligibilityError }, { status: 400 });
    const verified = await markSubmissionVerified(submission.id, repository.stars);
    return NextResponse.json({ repository: verified.repository, baselineStars: verified.baselineStars, verifiedAt: verified.verifiedAt, keepFileUntil: seasonFromCode(submission.season).endsAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂时无法验证仓库。";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
