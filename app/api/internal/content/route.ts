import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processInboundContent } from "@/lib/content-pipeline";
import { withinRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function inboundSecret() {
  const configured = process.env.VAULT2077_PIPELINE_SHARED_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("生产环境必须配置 VAULT2077_PIPELINE_SHARED_SECRET。");
  return "vault2077-local-pipeline-secret";
}

function validSignature(payload: string, supplied: string | null) {
  if (!supplied || !/^sha256=[A-Za-z0-9_-]+$/.test(supplied)) return false;
  const expected = `sha256=${createHmac("sha256", inboundSecret()).update(payload).digest("base64url")}`;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!withinRateLimit(`content:inbound:${ip}`, 12, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "采集请求过于频繁。" }, { status: 429 });
  }
  try {
    const raw = await request.text();
    if (raw.length === 0 || raw.length > 2_000_000) return NextResponse.json({ error: "采集包大小无效。" }, { status: 413 });
    if (!validSignature(raw, request.headers.get("x-vault2077-signature"))) {
      return NextResponse.json({ error: "采集签名无效。" }, { status: 401 });
    }
    const result = await processInboundContent(JSON.parse(raw) as unknown);
    return NextResponse.json({
      ok: true,
      state: result.state,
      events: result.events.length,
      projects: result.projects.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "采集包暂时无法处理。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
