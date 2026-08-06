import { NextRequest, NextResponse } from "next/server";
import { createOpcOrderLifecycle } from "@/lib/opc-order-lifecycle";
import { queryOpcAlipayTrade } from "@/lib/opc-payment-config";

export const runtime = "nodejs";
const lifecycle = createOpcOrderLifecycle({});

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
  if (!sameOrigin(request)) return NextResponse.json({ error: "付款凭证必须从当前页面查询。" }, { status: 403 });
  try {
    const { reference } = await context.params;
    if (!/^OPC-\d{8}-[0-9A-F]{12}$/.test(reference)) return NextResponse.json({ error: "订单号无效。" }, { status: 400 });
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 4_096) return NextResponse.json({ error: "查询内容过大。" }, { status: 413 });
    const body = JSON.parse(raw) as { token?: unknown };
    const token = typeof body.token === "string" && body.token
      ? body.token
      : request.cookies.get("vault2077_opc_resume")?.value ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return NextResponse.json({ error: "订单凭证无效。" }, { status: 403 });

    let order = await lifecycle.readResumedOrder({ reference, resumeToken: token });
    if (order.status === "awaiting_payment" || order.status === "payment_exception") {
      const claimed = await lifecycle.claimPublicPaymentQuery({ reference, minimumIntervalMs: 15_000 });
      if (claimed) {
        const result = await queryOpcAlipayTrade(reference);
        await lifecycle.applyActivePaymentQuery(result);
        order = await lifecycle.readResumedOrder({ reference, resumeToken: token });
      }
    }
    try {
      const receipt = await lifecycle.readPaymentReceipt({ reference, resumeToken: token });
      return NextResponse.json({ receipt, orderStatus: order.status }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof Error && error.message.includes("尚未生成")) {
        return NextResponse.json({ status: "verifying", orderStatus: order.status }, { status: 202, headers: { "Cache-Control": "no-store" } });
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂时无法核验付款状态。";
    if (error instanceof SyntaxError) return NextResponse.json({ error: "查询内容不是有效 JSON。" }, { status: 400 });
    if (message.includes("凭证无效")) return NextResponse.json({ error: message }, { status: 403 });
    console.error("OPC payment receipt query failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "付款状态暂时无法核验，请稍后重试。" }, { status: 502 });
  }
}
