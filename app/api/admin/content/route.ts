import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { getStoredContent } from "@/lib/content-store";
import { inboundBatchStats } from "@/lib/inbound-batch-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isValidAdminSession(request.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ error: "需要后台登录。" }, { status: 401 });
  }
  const [content, queue] = await Promise.all([getStoredContent(), inboundBatchStats()]);
  return NextResponse.json({ state: content.state, queue });
}
