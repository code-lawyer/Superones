import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchFrontierObservationTasks } from "@/lib/frontier-public-tasks";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";

export const runtime = "nodejs";

function secret() {
  const value = process.env.VAULT2077_FRONTIER_TASKS_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("Frontier 公开任务接口缺少服务端密钥。");
  return "vault2077-local-pipeline-secret!";
}

function authorized(value: string | null) {
  if (!value?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(secret());
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: NextRequest) {
  try {
    const clientHash = anonymizeClientAddress(requestClientAddress(request));
    if (!(await withinDurableRateLimit(`frontier:tasks:${clientHash}`, 60, 60 * 60 * 1000))) {
      return NextResponse.json({ error: "Frontier 公开任务读取过于频繁。" }, { status: 429 });
    }
    if (!authorized(request.headers.get("authorization"))) {
      return NextResponse.json({ error: "Frontier 公开任务认证失败。" }, { status: 401 });
    }
    const tasks = await dispatchFrontierObservationTasks();
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      tasks: tasks.map(({ taskId, kind, season, submissionId, owner, repo, requestedAt }) => ({
        taskId,
        kind,
        season,
        submissionId,
        owner,
        repo,
        requestedAt,
      })),
    });
  } catch (error) {
    console.error("Frontier public task dispatch failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { error: "暂时无法生成 Frontier 公开任务。" },
      { status: 503 },
    );
  }
}
