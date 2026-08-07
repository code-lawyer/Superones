import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildOpcPaperCheckoutAgreement } from "@/lib/opc-checkout-agreement";
import { createOpcOrderLifecycle } from "@/lib/opc-order-lifecycle";
import { OpcOrderIdempotencyConflictError } from "@/lib/opc-orders/model";
import { readPublishedServiceCatalog } from "@/lib/managed-service-catalog";
import {
  createOpcAlipayPaymentUrl,
  requireOpcAlipayConfiguration,
  selectOpcAlipayChannel,
} from "@/lib/opc-payment-config";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";

export const runtime = "nodejs";
const maximumBodyBytes = 24_576;

function cleanText(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value: string) {
  return /^(?:\+?86)?1[3-9]\d{9}$/.test(value.replace(/[\s-]/g, ""));
}

function sameOriginRequest(request: NextRequest) {
  if (request.headers.get("x-vault2077-public-request") !== "1") return false;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const expectedOrigin = process.env.NODE_ENV === "production"
      ? process.env.VAULT2077_PUBLIC_ORIGIN?.trim()
      : request.nextUrl.origin;
    return Boolean(expectedOrigin) && new URL(origin).origin === new URL(expectedOrigin!).origin;
  } catch {
    return false;
  }
}

async function readBoundedJson(request: NextRequest) {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maximumBodyBytes) throw new RangeError("订单内容超过大小限制。");
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new SyntaxError("订单内容不是有效 JSON。");
  }
}

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) {
    return NextResponse.json({ error: "订单内容超过大小限制。" }, { status: 413 });
  }
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: "订单必须从 Vault2077 当前页面发起。" }, { status: 403 });
  }
  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  if (!(await withinDurableRateLimit(`opc-orders:${clientHash}`, 6, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: "今天创建的订单较多，请稍后再试。" }, { status: 429 });
  }

  try {
    if (process.env.NODE_ENV === "production" && process.env.VAULT2077_OPC_PAPER_CHECKOUT_ENABLED !== "true") {
      return NextResponse.json({ error: "纸质签约付款入口未开放。" }, { status: 503 });
    }
    const configuration = requireOpcAlipayConfiguration();
    const body = await readBoundedJson(request);
    const idempotencyKey = cleanText(body.idempotencyKey, 80);
    const serviceSlug = cleanText(body.serviceSlug, 80).toLowerCase();
    const expectedServiceRevision = cleanText(body.serviceRevision, 80);
    const expectedAgreementVersion = cleanText(body.agreementVersion, 80);
    const expectedAgreementSha256 = cleanText(body.agreementSha256, 64).toLowerCase();
    const signatureMethod = body.signatureMethod;
    const serviceKind = body.serviceKind;
    const name = cleanText(body.name, 60);
    const phone = cleanText(body.phone, 40);
    const email = cleanText(body.email, 160).toLowerCase();
    const wechat = cleanText(body.wechat, 80);
    const note = cleanText(body.note, 800);
    const website = cleanText(body.website, 200);
    const signerType = body.signerType;
    const organizationName = cleanText(body.organizationName, 160);
    const organizationCreditCode = cleanText(body.organizationCreditCode, 32).toUpperCase();
    const legalRepresentativeName = cleanText(body.legalRepresentativeName, 60);
    const recipientName = cleanText(body.recipientName, 60);
    const deliveryPhone = cleanText(body.deliveryPhone, 40);
    const province = cleanText(body.province, 40);
    const city = cleanText(body.city, 40);
    const district = cleanText(body.district, 60);
    const addressLine = cleanText(body.addressLine, 240);
    const agreementAccepted = body.agreementAccepted === true;

    if (
      !/^[0-9a-f-]{36}$/i.test(idempotencyKey)
      || signatureMethod !== "paper"
      || (serviceKind !== "infrastructure" && serviceKind !== "specialty")
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(serviceSlug)
      || name.length < 2
      || website
      || !agreementAccepted
      || (signerType !== "individual" && signerType !== "organization")
      || !validPhone(phone)
      || (email && !validEmail(email))
      || (signerType === "organization" && (
        organizationName.length < 2
        || !/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(organizationCreditCode)
        || legalRepresentativeName.length < 2
      ))
      || recipientName.length < 2
      || !validPhone(deliveryPhone)
      || province.length < 2
      || city.length < 2
      || district.length < 1
      || addressLine.length < 4
    ) {
      return NextResponse.json({ error: "请完整填写签约方、联系人、纸质合同寄送地址并确认付款规则。" }, { status: 400 });
    }

    const catalog = await readPublishedServiceCatalog();
    const services = serviceKind === "infrastructure" ? catalog.infrastructure : catalog.specialties;
    const service = services.find((item) => item.slug === serviceSlug);
    if (!service || service.status !== "公开服务") {
      return NextResponse.json({ error: "该服务当前不接受新订单。" }, { status: 409 });
    }

    const paymentChannel = selectOpcAlipayChannel(body.paymentChannel, configuration);
    const lifecycle = createOpcOrderLifecycle({
      payments: {
        async createSession(order, channel) {
          const paymentOrder = {
            reference: order.reference,
            serviceCode: order.serviceCode,
            serviceName: order.serviceName,
            serviceRevision: order.serviceRevision,
            paymentAmount: order.amount,
          };
          return {
            url: createOpcAlipayPaymentUrl(paymentOrder, channel, configuration),
            channel,
            appId: configuration.appId,
            sellerId: configuration.sellerId,
            amount: order.amount,
          };
        },
      },
    });
    const acceptedAt = new Date().toISOString();
    const agreement = buildOpcPaperCheckoutAgreement({
      code: service.code,
      name: service.name,
      revision: service.revision,
      price: service.price,
      period: service.period,
      outcome: service.outcome,
      scope: service.includes.join("；"),
      boundary: service.boundary,
    });
    const agreementSha256 = createHash("sha256").update(agreement.text).digest("hex");
    if (
      expectedServiceRevision !== service.revision
      || expectedAgreementVersion !== agreement.version
      || expectedAgreementSha256 !== agreementSha256
    ) {
      return NextResponse.json({ error: "服务价格、范围或付款协议已经更新，请刷新页面后重新核对并确认。" }, { status: 409 });
    }
    const checkout = await lifecycle.createCheckout({
      idempotencyKey,
      signatureMethod,
      serviceKind,
      serviceSlug,
      serviceCode: service.code,
      serviceName: service.name,
      serviceRevision: service.revision,
      quotedPrice: service.price,
      servicePeriod: service.period,
      serviceOutcome: service.outcome,
      serviceScope: service.includes.join("；"),
      serviceBoundary: service.boundary,
      contact: { name, phone, email, wechat, note },
      signer: {
        type: signerType,
        name: signerType === "individual" ? name : legalRepresentativeName,
        phone,
        organizationName: signerType === "organization" ? organizationName : "",
        organizationCreditCode: signerType === "organization" ? organizationCreditCode : "",
        legalRepresentativeName: signerType === "organization" ? legalRepresentativeName : "",
      },
      delivery: { recipientName, phone: deliveryPhone, province, city, district, addressLine },
      agreement: {
        version: agreement.version,
        title: agreement.title,
        text: agreement.text,
        sha256: agreementSha256,
        acceptedAt,
      },
      paymentChannel,
    });
    if (!checkout.order.resumeToken) throw new Error("订单恢复凭证未生成。");
    const response = NextResponse.json({
      order: checkout.order,
      paymentUrl: checkout.paymentUrl,
      resumeToken: checkout.order.resumeToken,
      expiresInMinutes: 30,
    }, { status: 201 });
    response.cookies.set("vault2077_opc_resume", checkout.order.resumeToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 90 * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂时无法创建订单。";
    if (error instanceof RangeError) return NextResponse.json({ error: message }, { status: 413 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: message }, { status: 400 });
    if (error instanceof OpcOrderIdempotencyConflictError) return NextResponse.json({ error: message }, { status: 409 });
    if (message.includes("尚未完成生产配置") || message.includes("在线付款当前未开放")) {
      return NextResponse.json({ error: "付款服务尚未完成配置，当前不能创建订单。" }, { status: 503 });
    }
    console.error("OPC paper order creation failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "订单暂时无法创建，请稍后重试。" }, { status: 500 });
  }
}
