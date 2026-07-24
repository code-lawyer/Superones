import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { configuredAcquisitionWorker } from "@/lib/acquisition-runtime";
import { withinRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function workerSecret() {
  const configured = process.env.VAULT2077_PIPELINE_WORKER_SECRET
    || process.env.VAULT2077_PIPELINE_SHARED_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境必须配置统一采集 Worker 密钥。");
  }
  return "vault2077-local-pipeline-secret!";
}

function validAuthorization(value: string | null) {
  if (!value?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(workerSecret());
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!withinRateLimit(`acquisition:process:${ip}`, 60, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "统一采集处理请求过于频繁。", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }
  try {
    if (!validAuthorization(request.headers.get("authorization"))) {
      return NextResponse.json(
        { error: "统一采集处理认证失败。", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    const body = await request.json().catch(() => ({})) as { maxBatches?: unknown };
    const maxBatches = typeof body.maxBatches === "number" ? body.maxBatches : 8;
    const result = await configuredAcquisitionWorker().run(maxBatches);
    return NextResponse.json(
      { ok: result.failed.length === 0, partial: result.failed.length > 0, ...result },
      { status: result.failed.length > 0 ? 207 : 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "统一采集处理暂时失败。",
        code: "PROCESSING_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
}
