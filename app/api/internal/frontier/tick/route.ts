import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runFrontierTick } from "@/lib/frontier-service";

export const runtime = "nodejs";

function configuredSecret() {
  const secret = process.env.VAULT2077_FRONTIER_TICK_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") throw new Error("生产环境必须设置 VAULT2077_FRONTIER_TICK_SECRET。");
  return "vault2077-local-frontier-tick";
}

function authorized(value: string | null) {
  if (!value) return false;
  const expected = Buffer.from(configuredSecret());
  const supplied = Buffer.from(value);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export async function POST(request: NextRequest) {
  try {
    if (!authorized(request.headers.get("x-vault2077-frontier-secret"))) {
      return NextResponse.json({ error: "无权执行边境计划定时任务。" }, { status: 401 });
    }
    return NextResponse.json(await runFrontierTick());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "边境计划定时任务失败。" }, { status: 503 });
  }
}
