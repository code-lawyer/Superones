import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getOperationsHealth } from "@/lib/operations-health";

export const runtime = "nodejs";

function expectedSecret() {
  const value = process.env.VAULT2077_HEALTH_SECRET
    || process.env.VAULT2077_PIPELINE_WORKER_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("生产健康检查缺少鉴权密钥。");
  return "vault2077-local-health-secret-value";
}

function authorized(value: string | null) {
  if (!value?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(expectedSecret());
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: NextRequest) {
  try {
    if (!authorized(request.headers.get("authorization"))) {
      return NextResponse.json({ error: "健康检查认证失败。" }, { status: 401 });
    }
    const health = await getOperationsHealth();
    return NextResponse.json(health, {
      status: health.status === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", error: "健康检查不可用。" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
