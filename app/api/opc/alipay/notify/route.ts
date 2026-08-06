import { NextRequest, NextResponse } from "next/server";
import { createOpcOrderLifecycle } from "@/lib/opc-order-lifecycle";
import { verifyOpcAlipayNotification } from "@/lib/opc-payment-config";

export const runtime = "nodejs";
const maximumNotificationBytes = 32_768;
const lifecycle = createOpcOrderLifecycle({});

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
    if (Object.hasOwn(notification, key)) throw new Error("付款状态通知含重复字段。");
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
    await lifecycle.applyPaymentEvidence({
      reference: notification.reference,
      appId: notification.appId,
      sellerId: notification.sellerId,
      tradeNo: notification.tradeNo,
      tradeStatus: notification.tradeStatus,
      amount: notification.amount,
      source: "notify",
    });
    return textResponse("success");
  } catch (error) {
    console.error("OPC Alipay notification rejected", error instanceof Error ? error.message : "unknown");
    return textResponse("failure", 400);
  }
}
