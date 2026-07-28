import { NextRequest, NextResponse } from "next/server";
import { readPublishedServiceCatalog } from "@/lib/managed-service-catalog";
import { createOpcOrder } from "@/lib/opc-order-store";
import { requireOpcPaymentConfiguration } from "@/lib/opc-payment-config";
import { withinDurableRateLimit } from "@/lib/rate-limit";
import { anonymizeClientAddress, requestClientAddress } from "@/lib/request-client";

export const runtime = "nodejs";
const maximumBodyBytes = 16_384;

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
  if (Buffer.byteLength(raw, "utf8") > maximumBodyBytes) {
    throw new RangeError("订单登记内容超过大小限制。");
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new SyntaxError("订单登记内容不是有效的 JSON。");
  }
}

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBodyBytes) {
    return NextResponse.json({ error: "订单登记内容超过大小限制。" }, { status: 413 });
  }
  if (!sameOriginRequest(request)) {
    return NextResponse.json({ error: "订单登记必须从 Vault2077 当前页面发起。" }, { status: 403 });
  }

  const clientHash = anonymizeClientAddress(requestClientAddress(request));
  if (!(await withinDurableRateLimit(`opc-orders:${clientHash}`, 6, 24 * 60 * 60 * 1000))) {
    return NextResponse.json({ error: "今天创建的订单较多，请稍后再试或联系 OPC 服务团队。" }, { status: 429 });
  }

  try {
    const payment = await requireOpcPaymentConfiguration();
    const body = await readBoundedJson(request);
    const idempotencyKey = cleanText(body.idempotencyKey, 80);
    const serviceSlug = cleanText(body.serviceSlug, 80).toLowerCase();
    const serviceKind = body.serviceKind;
    const name = cleanText(body.name, 60);
    const phone = cleanText(body.phone, 40);
    const email = cleanText(body.email, 160).toLowerCase();
    const wechat = cleanText(body.wechat, 80);
    const note = cleanText(body.note, 800);
    const website = cleanText(body.website, 200);
    const consent = body.consent === true;

    if (
      !/^[0-9a-f-]{36}$/i.test(idempotencyKey)
      || (serviceKind !== "infrastructure" && serviceKind !== "specialty")
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(serviceSlug)
      || name.length < 2
      || website
      || !consent
      || (phone && !validPhone(phone))
      || (email && !validEmail(email))
      || (!phone && !email && wechat.length < 2)
    ) {
      return NextResponse.json(
        { error: "请填写联系人姓名和至少一种有效联系方式，并确认订单与隐私说明。" },
        { status: 400 },
      );
    }

    const catalog = await readPublishedServiceCatalog();
    const services = serviceKind === "infrastructure" ? catalog.infrastructure : catalog.specialties;
    const service = services.find((item) => item.slug === serviceSlug);
    if (!service || service.status !== "公开服务") {
      return NextResponse.json({ error: "该服务当前不接受新订单，请返回目录选择其他项目。" }, { status: 409 });
    }

    const order = await createOpcOrder({
      idempotencyKey,
      serviceKind,
      serviceSlug,
      serviceCode: service.code,
      serviceName: service.name,
      serviceRevision: service.revision,
      quotedPrice: service.price,
      contact: { name, phone, email, wechat, note },
    });
    return NextResponse.json({ order, payment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂时无法创建订单。";
    if (error instanceof RangeError) {
      return NextResponse.json({ error: message }, { status: 413 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("尚未完成生产配置")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    console.error("OPC order creation failed", error);
    return NextResponse.json({ error: "订单暂时无法创建，请稍后重试。" }, { status: 500 });
  }
}
