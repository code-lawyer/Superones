import { after, NextRequest } from "next/server";
import { recordOpcSignatureCallback } from "@/lib/opc-orders/signature";
import { handleOpcEsignCallback } from "@/lib/opc-esign-callback";
import { verifyOpcEsignCallback } from "@/lib/opc-esign";
import { reconcileOpcSignatureFlow } from "@/lib/opc-esign-reconciliation";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return handleOpcEsignCallback(request, {
    verify: verifyOpcEsignCallback,
    record: recordOpcSignatureCallback,
    reconcile: reconcileOpcSignatureFlow,
    defer: after,
  });
}
