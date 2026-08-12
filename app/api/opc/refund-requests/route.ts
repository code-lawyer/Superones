import { NextRequest, NextResponse } from "next/server";
import { readBoundedJsonBody } from "@/lib/bounded-json-body";
import {
  lookupOpcRefundApplication,
  requestOpcRefundApplication,
} from "@/lib/opc-orders/refund-application";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";
import {
  isValidOpcOrderReference,
  normalizeOpcOrderReference,
} from "@/lib/opc-order-reference";

export const runtime = "nodejs";
const maximumBodyBytes = 8_192;
const resumeCredential = /^[A-Za-z0-9_-]{43}$/;

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function sameOriginRequest(request: NextRequest) {
  if (request.headers.get("x-vault2077-public-request") !== "1") return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const expected = process.env.NODE_ENV === "production"
      ? process.env.VAULT2077_PUBLIC_ORIGIN?.trim()
      : request.nextUrl.origin;
    return Boolean(expected) && new URL(origin).origin === new URL(expected!).origin;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) {
    return privateJson({ error: "退款申请内容超过大小限制。" }, { status: 413 });
  }
  if (!sameOriginRequest(request)) {
    return privateJson({ error: "退款申请必须从当前网站发起。" }, { status: 403 });
  }
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  if (!(await withinDurableRateLimit(`opc-refund-requests:${clientHash}`, 20, 24 * 60 * 60 * 1000))) {
    return privateJson({ error: "今天查询或提交次数较多，请稍后再试。" }, { status: 429 });
  }

  try {
    const body = await readBoundedJsonBody(request, maximumBodyBytes);
    const action = body.action;
    const reference = typeof body.reference === "string" ? normalizeOpcOrderReference(body.reference) : "";
    const suppliedToken = typeof body.token === "string" ? body.token.trim() : "";
    const token = suppliedToken || request.cookies.get("vault2077_opc_resume")?.value || "";
    if (!isValidOpcOrderReference(reference) || !resumeCredential.test(token)) {
      return privateJson({ error: "订单号或订单凭证无效，请使用原下单浏览器重试。" }, { status: 403 });
    }

    if (action === "lookup") {
      return privateJson({ order: await lookupOpcRefundApplication(reference, token) });
    }
    if (action === "submit") {
      const reason = typeof body.reason === "string" ? body.reason : "";
      return privateJson({ order: await requestOpcRefundApplication({ reference, resumeToken: token, reason }) });
    }
    return privateJson({ error: "退款申请操作无效。" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "退款申请暂时无法处理。";
    if (error instanceof RangeError) return privateJson({ error: message }, { status: 413 });
    if (error instanceof SyntaxError) return privateJson({ error: "退款申请内容不是有效 JSON。" }, { status: 400 });
    if (message.includes("订单号或订单凭证无效")) return privateJson({ error: message }, { status: 403 });
    if (message.includes("不能新建") || message.includes("尚未确认到账") || message.includes("联系资料")) {
      return privateJson({ error: message }, { status: 409 });
    }
    if (message.includes("10 至 800")) return privateJson({ error: message }, { status: 400 });
    console.error("OPC refund application failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return privateJson({ error: "退款申请暂时无法处理，请稍后重试。" }, { status: 500 });
  }
}
