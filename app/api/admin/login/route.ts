import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminSession, isValidAdminPassword } from "@/lib/admin-auth";
import { withinRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!withinRateLimit(`admin:login:${ip}`, 8, 60 * 60 * 1000)) return NextResponse.json({ error: "登录尝试次数过多，请稍后再试。" }, { status: 429 });
  try {
    const body = await request.json() as { password?: unknown };
    if (typeof body.password !== "string" || !isValidAdminPassword(body.password)) {
      return NextResponse.json({ error: "密码不正确。" }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, createAdminSession(), { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 60 * 60 });
    return response;
  } catch {
    return NextResponse.json({ error: "登录请求无效。" }, { status: 400 });
  }
}
