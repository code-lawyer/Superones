import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processPendingInboundBatches } from "@/lib/content-worker";
import { ModelNotConfiguredError } from "@/lib/openai-compatible-client";
import { withinRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function workerSecret() {
  const configured = process.env.VAULT2077_PIPELINE_WORKER_SECRET || process.env.VAULT2077_PIPELINE_SHARED_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("生产环境必须配置内容处理密钥。");
  return "vault2077-local-pipeline-secret";
}

function validAuthorization(value: string | null) {
  if (!value?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(workerSecret());
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!withinRateLimit(`content:process:${ip}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "内容处理请求过于频繁。" }, { status: 429 });
  }
  try {
    if (!validAuthorization(request.headers.get("authorization"))) {
      return NextResponse.json({ error: "内容处理认证失败。" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({})) as { maxBatches?: unknown };
    const maxBatches = typeof body.maxBatches === "number" ? body.maxBatches : 4;
    const result = await processPendingInboundBatches(maxBatches);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ModelNotConfiguredError) {
      return NextResponse.json({ error: error.message, code: error.code, deferred: true }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "内容处理暂时失败。", code: "PROCESSING_FAILED" }, { status: 503 });
  }
}
