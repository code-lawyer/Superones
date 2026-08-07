import { NextRequest, NextResponse } from "next/server";
import {
  getOpcOrderPaymentOrder,
  recordOpcPaymentRequest,
} from "@/lib/opc-orders/checkout";
import { getOpcOrderByResumeToken } from "@/lib/opc-orders/signature";
import { reconcileOpcSignatureFlow } from "@/lib/opc-esign-reconciliation";
import {
  createOpcAlipayPaymentUrl,
  requireOpcAlipayConfiguration,
  selectOpcAlipayChannel,
} from "@/lib/opc-payment-config";

export const runtime = "nodejs";

function sameOrigin(request: NextRequest) {
  if (request.headers.get("x-vault2077-public-request") !== "1") return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  const expected = process.env.NODE_ENV === "production" ? process.env.VAULT2077_PUBLIC_ORIGIN : request.nextUrl.origin;
  try { return Boolean(expected) && new URL(origin).origin === new URL(expected!).origin; } catch { return false; }
}

export async function POST(request: NextRequest, context: { params: Promise<{ reference: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "订单恢复必须从当前页面发起。" }, { status: 403 });
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 4_096) return NextResponse.json({ error: "订单恢复内容超过大小限制。" }, { status: 413 });
  try {
    const { reference } = await context.params;
    if (!/^OPC-\d{8}-[0-9A-F]{12}$/.test(reference)) return NextResponse.json({ error: "订单号无效。" }, { status: 400 });
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4_096) return NextResponse.json({ error: "订单恢复内容超过大小限制。" }, { status: 413 });
    const body = JSON.parse(raw) as { token?: unknown; paymentChannel?: unknown };
    const token = typeof body.token === "string" && body.token
      ? body.token
      : request.cookies.get("vault2077_opc_resume")?.value ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return NextResponse.json({ error: "订单恢复凭据无效。" }, { status: 403 });

    let order = await getOpcOrderByResumeToken(reference, token);
    if (order.status === "awaiting_signature" && order.flowId) {
      await reconcileOpcSignatureFlow(order.flowId);
      order = await getOpcOrderByResumeToken(reference, token);
    }
    if (order.status !== "awaiting_payment") return NextResponse.json({ order });

    try {
      const configuration = requireOpcAlipayConfiguration();
      const channel = selectOpcAlipayChannel(body.paymentChannel, configuration);
      const paymentOrder = await getOpcOrderPaymentOrder(reference);
      const paymentUrl = createOpcAlipayPaymentUrl(paymentOrder, channel, configuration);
      await recordOpcPaymentRequest(reference, channel, configuration.sellerId, configuration.appId);
      return NextResponse.json({ order, paymentUrl, paymentChannel: channel, expiresInMinutes: 30 });
    } catch (error) {
      console.error("OPC payment link creation after signature failed", { errorType: error instanceof Error ? error.name : "unknown" });
      return NextResponse.json({ order, paymentUnavailable: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "订单状态暂时无法核验。";
    if (error instanceof SyntaxError) return NextResponse.json({ error: "订单恢复内容不是有效 JSON。" }, { status: 400 });
    if (message.includes("凭据无效")) return NextResponse.json({ error: message }, { status: 403 });
    console.error("OPC order resume failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "订单状态暂时无法核验，请稍后重试。" }, { status: 502 });
  }
}
