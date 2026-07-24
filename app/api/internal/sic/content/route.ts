import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ingestSicRawContent, refreshSicContent, type SicRawCollection } from "@/lib/sic-collector";
import { readJsonRequestBounded } from "@/lib/sic-fetch";
import { withinRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function collectorSecret() {
  const configured = process.env.VAULT2077_SIC_COLLECTOR_SECRET || process.env.VAULT2077_PIPELINE_SHARED_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("生产环境必须配置 SiC 采集密钥。");
  return "vault2077-local-sic-secret";
}

function validAuthorization(value: string | null) {
  if (!value?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(collectorSecret());
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!withinRateLimit(`sic:content:${ip}`, 8, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "SiC 内容采集请求过于频繁。" }, { status: 429 });
  }
  try {
    if (!validAuthorization(request.headers.get("authorization"))) {
      return NextResponse.json({ error: "SiC 内容采集认证失败。" }, { status: 401 });
    }
    const hasPacket = request.headers.get("content-type")?.includes("application/json") && request.body;
    if (!hasPacket && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "生产环境只接受境外采集包。" }, { status: 400 });
    }
    const result = hasPacket
      ? await ingestSicRawContent(await readJsonRequestBounded<SicRawCollection>(request, 8 * 1024 * 1024))
      : await refreshSicContent();
    const failures = result.reports.filter((report) => report.status === "failure").length;
    return NextResponse.json({
      ok: failures === 0,
      partial: failures > 0,
      collectedAt: result.state.updatedAt,
      items: result.items.length,
      sources: result.reports.length,
      failures,
    }, { status: failures > 0 ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "SiC 内容采集暂时失败。" }, { status: 503 });
  }
}
