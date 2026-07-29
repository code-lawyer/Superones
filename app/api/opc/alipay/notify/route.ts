import { NextRequest, NextResponse } from "next/server";
import { applyOpcAlipayTradeResult } from "@/lib/opc-order-store";
import { verifyOpcAlipayNotification } from "@/lib/opc-payment-config";

export const runtime = "nodejs";
const maximumNotificationBytes = 32_768;

function textResponse(body: "success" | "failure", status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function parseNotification(raw: string) {
  const notification: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    if (Object.hasOwn(notification, key)) throw new Error("支付宝异步通知含重复字段。");
    notification[key] = value;
  }
  return notification;
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return textResponse("failure", 415);
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumNotificationBytes) {
    return textResponse("failure", 413);
  }

  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > maximumNotificationBytes) {
      return textResponse("failure", 413);
    }
    const notification = verifyOpcAlipayNotification(parseNotification(raw));
    await applyOpcAlipayTradeResult({
      reference: notification.reference,
      tradeNo: notification.tradeNo,
      tradeStatus: notification.tradeStatus,
      totalAmount: notification.totalAmount,
      source: "notify",
    });
    return textResponse("success");
  } catch (error) {
    console.error("OPC Alipay notification rejected", error instanceof Error ? error.message : "unknown");
    return textResponse("failure", 400);
  }
}
