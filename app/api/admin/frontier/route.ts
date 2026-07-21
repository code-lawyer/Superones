import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { listAdminSubmissions, listVerifiedSubmissions, updateSubmissionStars } from "@/lib/frontier-store";
import { inspectGitHubRepository } from "@/lib/github";

export const runtime = "nodejs";

function authorized(request: NextRequest) {
  return isValidAdminSession(request.cookies.get(ADMIN_COOKIE)?.value);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "需要后台登录。" }, { status: 401 });
  return NextResponse.json({ submissions: await listAdminSubmissions() });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "需要后台登录。" }, { status: 401 });
  try {
    const body = await request.json() as { action?: unknown };
    if (body.action !== "refresh-stars") return NextResponse.json({ error: "不支持的后台操作。" }, { status: 400 });
    const verified = await listVerifiedSubmissions();
    const result = await Promise.allSettled(verified.map(async (submission) => {
      const repository = await inspectGitHubRepository(submission.owner, submission.repo);
      await updateSubmissionStars(submission.id, repository.stars);
      return submission.repository;
    }));
    const refreshed = result.filter((item) => item.status === "fulfilled").length;
    const failed = result.length - refreshed;
    return NextResponse.json({ refreshed, failed, submissions: await listAdminSubmissions() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂时无法刷新 Star。";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
