import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { withinRateLimit } from "@/lib/rate-limit";
import { refreshSicExtensionSnapshots } from "@/lib/sic-extensions";
import { refreshGithubRankingSnapshot } from "@/lib/sic-github-rankings";
import { refreshOfficialSicSnapshots } from "@/lib/sic-snapshots";

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
    const [models, github, extensions] = await Promise.allSettled([
      refreshOfficialSicSnapshots(),
      refreshGithubRankingSnapshot(),
      refreshSicExtensionSnapshots(),
    ]);
    if (models.status === "rejected" && github.status === "rejected" && extensions.status === "rejected") throw new Error("所有 SiC 指标上游均暂时不可用。");
    const modelResult = models.status === "fulfilled"
      ? models.value
      : { error: models.reason instanceof Error ? models.reason.message : "模型快照失败。" };
    const githubResult = github.status === "fulfilled"
      ? github.value
      : { error: github.reason instanceof Error ? github.reason.message : "GitHub 榜单快照失败。" };
    const extensionResult = extensions.status === "fulfilled"
      ? extensions.value
      : { error: extensions.reason instanceof Error ? extensions.reason.message : "扩展生态快照失败。" };
    const partial = models.status === "rejected"
      || github.status === "rejected"
      || extensions.status === "rejected"
      || (models.status === "fulfilled" && ("error" in models.value.huggingFace || "error" in models.value.openRouter))
      || (github.status === "fulfilled" && ("error" in github.value.trending || "error" in github.value.daily || "error" in github.value.weekly))
      || (extensions.status === "fulfilled" && Boolean(extensions.value.errors.skills || extensions.value.errors.mcps));
    return NextResponse.json({
      ok: !partial,
      partial,
      models: modelResult,
      github: githubResult,
      extensions: extensionResult,
    }, { status: partial ? 207 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "SiC 快照采集失败。" }, { status: 503 });
  }
}
