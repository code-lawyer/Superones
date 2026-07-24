import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { refreshDirectRankings } from "@/lib/direct-rankings";
import { withinRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function collectorSecret() {
  const configured = process.env.VAULT2077_SIC_COLLECTOR_SECRET || process.env.VAULT2077_PIPELINE_SHARED_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("生产环境必须配置 SiC 快照采集密钥。");
  return "vault2077-local-pipeline-secret";
}

function hasValidAuthorization(value: string | null) {
  if (!value?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(collectorSecret());
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!withinRateLimit(`sic:snapshot:${ip}`, 12, 60 * 60 * 1000)) return NextResponse.json({ error: "SiC 快照请求过于频繁。" }, { status: 429 });
  if (!hasValidAuthorization(request.headers.get("authorization"))) return NextResponse.json({ error: "SiC 快照采集认证失败。" }, { status: 401 });
  try {
    const result = await refreshDirectRankings();
    if (result.boards.length === 0) throw new Error("所有平台原生榜单均暂时不可用。");
    const partial = Object.keys(result.errors).length > 0;
    return NextResponse.json({
      ok: !partial,
      partial,
      ...result,
    }, { status: partial ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "SiC 快照采集失败。" }, { status: 503 });
  }
}
