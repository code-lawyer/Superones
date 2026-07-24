import { NextRequest, NextResponse } from "next/server";
import {
  AcquisitionReceiveError,
  configuredAcquisitionReceiver,
} from "@/lib/acquisition-inbox";
import { MAX_ACQUISITION_BATCH_BYTES } from "@/lib/acquisition-contract";
import { withinRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

async function readBoundedBody(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ACQUISITION_BATCH_BYTES) {
    throw new AcquisitionReceiveError(
      `采集批次不得超过 ${MAX_ACQUISITION_BATCH_BYTES} 字节。`,
      "INVALID_BODY_SIZE",
      413,
    );
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ACQUISITION_BATCH_BYTES) {
      await reader.cancel();
      throw new AcquisitionReceiveError(
        `采集批次不得超过 ${MAX_ACQUISITION_BATCH_BYTES} 字节。`,
        "INVALID_BODY_SIZE",
        413,
      );
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!withinRateLimit(`acquisition:inbound:${ip}`, 120, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "统一采集请求过于频繁。", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }
  try {
    const result = await configuredAcquisitionReceiver().receive({
      batchId: request.headers.get("x-vault2077-batch-id") ?? "",
      timestamp: request.headers.get("x-vault2077-timestamp") ?? "",
      signature: request.headers.get("x-vault2077-signature"),
      rawPayload: await readBoundedBody(request),
    });
    return NextResponse.json(
      { ok: true, ...result },
      { status: result.duplicate && result.status === "succeeded" ? 200 : 202 },
    );
  } catch (error) {
    if (error instanceof AcquisitionReceiveError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "采集批次暂时无法安全持久化。", code: "PERSISTENCE_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
