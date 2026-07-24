import { NextRequest, NextResponse } from "next/server";
import { currentSeason, createPrizeDonation } from "@/lib/frontier-store";
import { withinRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function clientKey(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(request: NextRequest) {
  if (!withinRateLimit(`frontier:donation:${clientKey(request)}`, 6, 24 * 60 * 60 * 1000)) {
    return NextResponse.json({ error: "今天提交的奖品较多，请稍后再试。" }, { status: 429 });
  }
  try {
    const body = await request.json() as { name?: unknown; description?: unknown; email?: unknown; noticeAccepted?: unknown };
    if (typeof body.name !== "string" || typeof body.description !== "string" || typeof body.email !== "string" || body.noticeAccepted !== true) {
      return NextResponse.json({ error: "请完整填写奖品信息并同意奖品捐献须知。" }, { status: 400 });
    }
    const name = body.name.trim();
    const description = body.description.trim();
    const email = body.email.trim().toLowerCase();
    if (name.length < 2 || name.length > 80) return NextResponse.json({ error: "奖品名称需为 2–80 个字符。" }, { status: 400 });
    if (description.length < 6 || description.length > 600) return NextResponse.json({ error: "奖品说明需为 6–600 个字符。" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "请输入有效 Email。" }, { status: 400 });

    const donation = await createPrizeDonation({ name, description, email, noticeAccepted: true });
    const season = currentSeason();
    return NextResponse.json({ id: donation.id, season: season.code, seasonName: season.name, status: donation.status }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "暂时无法提交奖品。" }, { status: 500 });
  }
}
