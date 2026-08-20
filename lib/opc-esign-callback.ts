import { createHash } from "node:crypto";
import { readBoundedTextBody } from "./bounded-json-body.ts";
import { readOpcEsignConfiguration } from "./opc-esign.ts";

const maximumBodyBytes = 128 * 1024;

export type OpcEsignCallbackDependencies = {
  verify(rawBody: string, headers: Headers): Record<string, unknown>;
  record(flowId: string, bodySha256: string): Promise<unknown>;
  reconcile(flowId: string): Promise<unknown>;
  defer(task: () => Promise<void>): void;
};

function findFlowId(payload: Record<string, unknown>) {
  const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : payload;
  const value = data.signFlowId ?? data.flowId;
  return typeof value === "string" ? value : "";
}

export async function handleOpcEsignCallback(
  request: Request,
  dependencies: OpcEsignCallbackDependencies,
  environment: Record<string, string | undefined> = process.env,
) {
  if (environment.VAULT2077_OPC_ESIGN_ENABLED !== "true" || !readOpcEsignConfiguration(environment)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maximumBodyBytes) return new Response("too large", { status: 413 });
  try {
    const raw = await readBoundedTextBody(request, maximumBodyBytes, "too large");
    const flowId = findFlowId(dependencies.verify(raw, request.headers));
    if (!flowId || flowId.length > 128) throw new Error("电子签约回调缺少流程编号。");
    const matchedOrder = await dependencies.record(flowId, createHash("sha256").update(raw).digest("hex"));
    if (matchedOrder) {
      dependencies.defer(async () => {
        try {
          await dependencies.reconcile(flowId);
        } catch (error) {
          console.error("OPC e-sign callback reconciliation failed", { errorType: error instanceof Error ? error.name : "unknown" });
        }
      });
    }
    return Response.json({ code: "200", msg: "success" });
  } catch (error) {
    if (error instanceof RangeError && error.message === "too large") {
      return new Response("too large", { status: 413 });
    }
    console.error("OPC e-sign callback rejected", { errorType: error instanceof Error ? error.name : "unknown" });
    return Response.json({ code: "401", msg: "rejected" }, { status: 401 });
  }
}
