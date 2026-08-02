import { after, NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { recordOpcSignatureCallback } from "@/lib/opc-order-store";
import { verifyOpcEsignCallback } from "@/lib/opc-esign";
import { reconcileOpcSignatureFlow } from "@/lib/opc-esign-reconciliation";

export const runtime = "nodejs";
const maximumBodyBytes = 128 * 1024;

function findFlowId(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : payload;
  const value = data.signFlowId ?? data.flowId;
  return typeof value === "string" ? value : "";
}

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maximumBodyBytes) return new NextResponse("too large", { status: 413 });
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > maximumBodyBytes) return new NextResponse("too large", { status: 413 });
    const flowId = findFlowId(verifyOpcEsignCallback(raw, request.headers));
    if (!flowId || flowId.length > 128) throw new Error("电子签约回调缺少流程编号。");
    const matchedOrder = await recordOpcSignatureCallback(flowId, createHash("sha256").update(raw).digest("hex"));
    if (matchedOrder) {
      after(async () => {
        try {
          await reconcileOpcSignatureFlow(flowId);
        } catch (error) {
          console.error("OPC e-sign callback reconciliation failed", { errorType: error instanceof Error ? error.name : "unknown" });
        }
      });
    }
    return NextResponse.json({ code: "200", msg: "success" });
  } catch (error) {
    console.error("OPC e-sign callback rejected", { errorType: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ code: "401", msg: "rejected" }, { status: 401 });
  }
}
