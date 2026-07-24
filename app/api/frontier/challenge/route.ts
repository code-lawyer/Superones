import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createPendingSubmission, currentSeason } from "@/lib/frontier-store";
import { repositoryEligibilityError } from "@/lib/frontier-service";
import { inspectGitHubRepository, parseGitHubRepository } from "@/lib/github";
import { withinRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(request: NextRequest) {
  if (!withinRateLimit(`frontier:challenge:${clientKey(request)}`, 8, 60 * 60 * 1000)) {
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
    const repository = await inspectGitHubRepository(owner, repo);
    const eligibilityError = repositoryEligibilityError(repository);
    if (eligibilityError) return NextResponse.json({ error: eligibilityError }, { status: 400 });

    const challenge = randomBytes(24).toString("base64url");
    const submission = await createPendingSubmission({ owner, repo, email, note, defaultBranch: repository.defaultBranch, challenge, rulesAccepted: true });
    const season = currentSeason();
    const filePath = `.vault2077/season-${season.code}.json`;
    return NextResponse.json({
      id: submission.id,
      season: season.code,
      seasonName: season.name,
      repository: submission.repository,
      filePath,
      expiresAt: submission.challengeExpiresAt,
      payload: {
        platform: "vault2077",
        season: season.code,
        repository: submission.repository,
        challenge,
        issuedAt: submission.createdAt,
      },
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂时无法创建验证文件。";
    const status = message.includes("已经") || message.includes("获奖") ? 409 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
