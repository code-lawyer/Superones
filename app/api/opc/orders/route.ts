import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildOpcOfflineCheckoutAgreement } from "@/lib/opc-offline-checkout-agreement";
import { readPublishedOpcOfflinePaymentProfile } from "@/lib/opc-offline-payment-profile";
import { readBoundedJsonBody } from "@/lib/bounded-json-body";
import { createOpcOrder } from "@/lib/opc-orders/checkout";
import { OpcOrderIdempotencyConflictError } from "@/lib/opc-orders/model";
import { readPublishedServiceCatalog } from "@/lib/managed-service-catalog";
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
    if (process.env.NODE_ENV === "production" && process.env.VAULT2077_OPC_OFFLINE_PAYMENT_ENABLED !== "true") {
      return NextResponse.json({ error: "线下付款入口未开放。" }, { status: 503 });
    }
    const profile = await readPublishedOpcOfflinePaymentProfile();
    if (!profile) return NextResponse.json({ error: "企业收款资料尚未发布。" }, { status: 503 });

    const body = await readBoundedJsonBody(request, maximumBodyBytes);
    const idempotencyKey = cleanText(body.idempotencyKey, 80);
    const serviceSlug = cleanText(body.serviceSlug, 80).toLowerCase();
    const expectedServiceRevision = cleanText(body.serviceRevision, 80);
    const expectedAgreementVersion = cleanText(body.agreementVersion, 80);
    const expectedAgreementSha256 = cleanText(body.agreementSha256, 64).toLowerCase();
    const expectedProfileRevision = cleanText(body.paymentProfileRevision, 80);
    const signatureMethod = body.signatureMethod;
    const paymentMethod = body.paymentMethod;
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
    const agreementAccepted = body.agreementAccepted === true;

    if (
      !/^[0-9a-f-]{36}$/i.test(idempotencyKey)
      || signatureMethod !== "online"
      || paymentMethod !== "offline_bank_transfer"
      || expectedProfileRevision !== profile.revision
      || (serviceKind !== "infrastructure" && serviceKind !== "specialty")
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(serviceSlug)
      || name.length < 2
      || website
      || !agreementAccepted
      || (signerType !== "individual" && signerType !== "organization")
      || !validPhone(phone)
      || !validEmail(email)
      || (signerType === "organization" && (
        organizationName.length < 2
        || !/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(organizationCreditCode)
        || legalRepresentativeName.length < 2
      ))
    ) {
      return NextResponse.json({ error: "请完整填写付款方和联系人信息，并确认当前版本的服务协议与线下付款规则。" }, { status: 400 });
    }

    const catalog = await readPublishedServiceCatalog();
    const services = serviceKind === "infrastructure" ? catalog.infrastructure : catalog.specialties;
    const service = services.find((item) => item.slug === serviceSlug);
    if (!service || service.status !== "公开服务") {
      return NextResponse.json({ error: "该服务当前不接受新订单。" }, { status: 409 });
    }

    const acceptedAt = new Date().toISOString();
    const agreement = buildOpcOfflineCheckoutAgreement(service, profile);
    const agreementSha256 = createHash("sha256").update(agreement.text).digest("hex");
    if (
      expectedServiceRevision !== service.revision
      || expectedAgreementVersion !== agreement.version
      || expectedAgreementSha256 !== agreementSha256
    ) {
      return NextResponse.json({ error: "服务价格、范围、付款资料或协议已经更新，请刷新页面后重新核对。" }, { status: 409 });
    }

    const order = await createOpcOrder({
      idempotencyKey,
      signatureMethod: "online",
      paymentProvider: "bank_transfer",
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
      agreement: {
        version: agreement.version,
        title: agreement.title,
        text: agreement.text,
        sha256: agreementSha256,
        acceptedAt,
      },
      offlinePaymentSnapshot: {
        revision: profile.revision,
        account: profile.account,
        agreementSha256: profile.agreement.sha256,
        contactQrSha256: profile.contactQr.sha256,
      },
    });
    if (!order.resumeToken) throw new Error("订单恢复凭证未生成。");
    const response = NextResponse.json({
      order,
      resumeToken: order.resumeToken,
    }, { status: 201 });
    response.cookies.set("vault2077_opc_resume", order.resumeToken, {
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
    console.error("OPC offline order creation failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "线下付款单暂时无法创建，请稍后重试。" }, { status: 500 });
  }
}
