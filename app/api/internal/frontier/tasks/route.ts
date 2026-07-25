import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { dispatchFrontierObservationTasks } from "@/lib/frontier-public-tasks";

export const runtime = "nodejs";

function secret() {
  const value = process.env.VAULT2077_PIPELINE_WORKER_SECRET
    || process.env.VAULT2077_PIPELINE_SHARED_SECRET;
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
    if (!authorized(request.headers.get("authorization"))) {
      return NextResponse.json({ error: "Frontier 公开任务认证失败。" }, { status: 401 });
    }
    const tasks = await dispatchFrontierObservationTasks();
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      tasks: tasks.map(({ taskId, season, submissionId, owner, repo, requestedAt }) => ({
        taskId,
        season,
        submissionId,
        owner,
        repo,
        requestedAt,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "暂时无法生成 Frontier 公开任务。" },
      { status: 503 },
    );
  }
}
