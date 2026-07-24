import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ContentContractError, payloadHash, signingInput, validateContentBatch } from "@/lib/content-contract";
import { persistInboundBatch, PersistedBatchConflictError } from "@/lib/inbound-batch-store";
import { withinRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

function inboundSecret() {
  const configured = process.env.VAULT2077_PIPELINE_SHARED_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("生产环境必须配置 VAULT2077_PIPELINE_SHARED_SECRET。");
  return "vault2077-local-pipeline-secret";
}

function validSignature(input: string, supplied: string | null) {
  if (!supplied || !/^sha256=[A-Za-z0-9_-]+$/.test(supplied)) return false;
  const expected = `sha256=${createHmac("sha256", inboundSecret()).update(input).digest("base64url")}`;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!withinRateLimit(`content:inbound:${ip}`, 120, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "采集请求过于频繁。" }, { status: 429 });
  }
  try {
    const raw = await request.text();
    if (raw.length === 0 || Buffer.byteLength(raw, "utf8") > 2_000_000) return NextResponse.json({ error: "采集包大小无效。" }, { status: 413 });
    const batchId = request.headers.get("x-vault2077-batch-id") ?? "";
    const timestamp = request.headers.get("x-vault2077-timestamp") ?? "";
    const timestampSeconds = Number(timestamp);
    if (!/^\d{10}$/.test(timestamp) || !Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() - timestampSeconds * 1000) > 5 * 60 * 1000) {
      return NextResponse.json({ error: "采集时间戳无效或已过期。" }, { status: 401 });
    }
    const bodyHash = payloadHash(raw);
    if (!validSignature(signingInput(timestamp, batchId, bodyHash), request.headers.get("x-vault2077-signature"))) {
      return NextResponse.json({ error: "采集签名无效。" }, { status: 401 });
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || (parsed as { batchId?: unknown }).batchId !== batchId) {
      return NextResponse.json({ error: "请求头与正文的 batchId 不一致。" }, { status: 400 });
    }
    const batch = validateContentBatch(parsed);
    const persisted = await persistInboundBatch(batchId, bodyHash, raw);
    return NextResponse.json({
      ok: true,
      accepted: true,
      duplicate: persisted.duplicate,
      status: persisted.status,
      batchId: batch.batchId,
      information: batch.information.length,
      repositories: batch.repositories.length,
    }, { status: persisted.duplicate && persisted.status === "succeeded" ? 200 : 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "采集包暂时无法处理。";
    if (error instanceof PersistedBatchConflictError) return NextResponse.json({ error: message }, { status: 409 });
    if (error instanceof ContentContractError && error.code === "BATCH_TOO_LARGE") return NextResponse.json({ error: message }, { status: 413 });
    if (error instanceof ContentContractError || error instanceof SyntaxError) return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: "采集包暂时无法安全持久化。" }, { status: 503 });
  }
}
