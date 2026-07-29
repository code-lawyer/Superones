"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import {
  clearFieldError,
  focusFirstInvalidField,
  isValidEmail,
} from "@/lib/client-form-validation";
import type { OpcService } from "@/lib/opc-catalog";

type OrderField = "name" | "phone" | "email" | "wechat" | "consent";
type OrderErrors = Partial<Record<OrderField, string>>;

type CreatedOrder = {
  id: string;
  reference: string;
  status: "awaiting_payment";
  serviceName: string;
  quotedPrice: string;
  createdAt: string;
};

const fieldOrder: readonly OrderField[] = ["name", "phone", "email", "wechat", "consent"];
const alipayGatewayHosts = new Set(["openapi.alipay.com", "openapi-sandbox.dl.alipaydev.com"]);

function validPhone(value: string) {
  return /^(?:\+?86)?1[3-9]\d{9}$/.test(value.replace(/[\s-]/g, ""));
}

function validAlipayPaymentUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && alipayGatewayHosts.has(url.hostname);
  } catch {
    return false;
  }
}

export function OpcOrderEntry({ service, enabled }: {
  service: OpcService;
  enabled: boolean;
}) {
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [wechat, setWechat] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<OrderErrors>({});
  const [requestError, setRequestError] = useState("");
  const [pending, setPending] = useState(false);
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  function open() {
    if (!enabled) return;
    setExpanded(true);
    requestAnimationFrame(() => {
      formHeadingRef.current?.focus({ preventScroll: true });
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      formHeadingRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  function validate() {
    const next: OrderErrors = {};
    if (name.trim().length < 2) next.name = "请填写至少 2 个字的联系人姓名。";
    if (phone.trim() && !validPhone(phone)) next.phone = "请填写有效的中国大陆手机号。";
    if (email.trim() && !isValidEmail(email.trim())) next.email = "请填写有效的联系邮箱。";
    if (wechat.trim() && wechat.trim().length < 2) next.wechat = "微信号至少需要 2 个字符。";
    if (!phone.trim() && !email.trim() && !wechat.trim()) {
      next.phone = "手机号、邮箱或微信号至少填写一项。";
    }
    if (!consent) next.consent = "请确认订单登记与隐私说明。";
    setErrors(next);
    focusFirstInvalidField(fieldOrder, next);
    return Object.keys(next).length === 0;
  }

  function updateField(field: OrderField, update: () => void) {
    update();
    setErrors((current) => {
      const withoutField = clearFieldError(current, field);
      if (
        (field === "email" || field === "wechat")
        && !phone.trim()
      ) {
        return clearFieldError(withoutField, "phone");
      }
      return withoutField;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    setPending(true);
    setRequestError("");
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/opc/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Vault2077-Public-Request": "1",
        },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current,
          serviceKind: service.kind,
          serviceSlug: service.slug,
          name,
          phone,
          email,
          wechat,
          note,
          website,
          consent,
          paymentChannel: window.matchMedia("(max-width: 820px)").matches ? "wap" : "page",
        }),
      });
      const body = await response.json().catch(() => null) as {
        error?: unknown;
        order?: CreatedOrder;
        paymentUrl?: unknown;
      } | null;
      if (
        !response.ok
        || !body?.order
        || typeof body.paymentUrl !== "string"
        || !validAlipayPaymentUrl(body.paymentUrl)
      ) {
        throw new Error(typeof body?.error === "string" ? body.error : "订单暂时无法创建，请稍后重试。");
      }
      setOrder(body.order);
      setPaymentUrl(body.paymentUrl);
      window.location.assign(body.paymentUrl);
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : "订单暂时无法创建，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  async function copyReference() {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.reference);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={expanded ? "opc-order-entry is-expanded" : "opc-order-entry"} aria-labelledby={`opc-order-${service.slug}`}>
      {!expanded ? (
        <div className="opc-order-entry__closed">
          <div>
            <p className="mono">ORDER / 下单</p>
            <strong id={`opc-order-${service.slug}`}>提交联系方式后前往支付宝官方收银台</strong>
          </div>
          <button type="button" onClick={open} disabled={!enabled}>
            {enabled ? "下单并前往支付宝" : "支付宝接口尚未启用"} <span aria-hidden="true">↘</span>
          </button>
          {!enabled ? <p>支付宝开放平台应用、商户身份和 RSA2 密钥完成服务器配置后开放。</p> : null}
        </div>
      ) : order && paymentUrl ? (
        <div className="opc-order-entry__payment" role="status">
          <div className="opc-order-entry__payment-copy">
            <p className="mono">PAYMENT / 支付宝收银台</p>
            <h3 ref={formHeadingRef} tabIndex={-1}>订单已登记，正在前往支付宝。</h3>
            <dl>
              <div><dt>订单号</dt><dd>{order.reference}</dd></div>
              <div><dt>服务</dt><dd>{order.serviceName}</dd></div>
              <div><dt>应付金额</dt><dd>{order.quotedPrice}</dd></div>
            </dl>
            <p>后台已经形成待付款订单。完成付款后，支付宝会把验签结果通知 Vault2077，订单将自动更新为已支付；返回页面本身不作为到账依据。</p>
            <a href={paymentUrl}>如果没有自动跳转，点击进入支付宝收银台 <span aria-hidden="true">↗</span></a>
            <button type="button" onClick={() => void copyReference()}>{copied ? "订单号已复制" : "复制订单号"}</button>
          </div>
        </div>
      ) : (
        <form className="opc-order-entry__form" onSubmit={submit} noValidate>
          <header>
            <p className="mono">ORDER REGISTER / 订单登记</p>
            <h3 id={`opc-order-${service.slug}`} ref={formHeadingRef} tabIndex={-1}>留下联系方式，生成付款订单。</h3>
            <p>本次登记对应「{service.name}」{service.revision}，应付金额为 {service.price}。提交后会创建待付款订单并跳转至支付宝官方收银台。</p>
          </header>
          <div className="opc-order-entry__fields">
            <div className="form-field">
              <label htmlFor="opc-order-name">联系人姓名</label>
              <input id="opc-order-name" name="name" autoComplete="name" maxLength={60} value={name} onChange={(event) => updateField("name", () => setName(event.target.value))} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "opc-order-name-error" : undefined} disabled={pending} required />
              {errors.name ? <p id="opc-order-name-error" className="form-error">{errors.name}</p> : null}
            </div>
            <div className="form-field">
              <label htmlFor="opc-order-phone">手机号（可选）</label>
              <input id="opc-order-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(event) => updateField("phone", () => setPhone(event.target.value))} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "opc-order-phone-error" : undefined} disabled={pending} />
              {errors.phone ? <p id="opc-order-phone-error" className="form-error">{errors.phone}</p> : null}
            </div>
            <div className="form-field">
              <label htmlFor="opc-order-email">邮箱（可选）</label>
              <input id="opc-order-email" name="email" type="email" autoComplete="email" maxLength={160} value={email} onChange={(event) => updateField("email", () => setEmail(event.target.value))} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "opc-order-email-error" : undefined} disabled={pending} />
              {errors.email ? <p id="opc-order-email-error" className="form-error">{errors.email}</p> : null}
            </div>
            <div className="form-field">
              <label htmlFor="opc-order-wechat">微信号（可选）</label>
              <input id="opc-order-wechat" name="wechat" autoComplete="off" maxLength={80} value={wechat} onChange={(event) => updateField("wechat", () => setWechat(event.target.value))} aria-invalid={Boolean(errors.wechat)} aria-describedby={errors.wechat ? "opc-order-wechat-error" : undefined} disabled={pending} />
              {errors.wechat ? <p id="opc-order-wechat-error" className="form-error">{errors.wechat}</p> : null}
            </div>
            <div className="form-field opc-order-entry__note">
              <label htmlFor="opc-order-note">情况说明（可选）</label>
              <textarea id="opc-order-note" name="note" rows={4} maxLength={800} value={note} onChange={(event) => setNote(event.target.value)} disabled={pending} />
              <p>不要填写身份证号、银行卡号、密码或尚未要求提交的业务材料。</p>
            </div>
            <div className="opc-order-entry__honeypot" aria-hidden="true">
              <label htmlFor="opc-order-website">网站</label>
              <input id="opc-order-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </div>
            <div className="opc-order-entry__consent">
              <input id="opc-order-consent" type="checkbox" checked={consent} onChange={(event) => updateField("consent", () => setConsent(event.target.checked))} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? "opc-order-consent-error" : undefined} disabled={pending} />
              <label htmlFor="opc-order-consent">我已阅读并同意<Link href="/terms">服务条款</Link>与<Link href="/privacy">隐私说明</Link>，确认当前服务名称、公开价格与范围，并同意 Vault2077 为订单联系、付款核验和后续交付处理上述联系方式。</label>
              {errors.consent ? <p id="opc-order-consent-error" className="form-error">{errors.consent}</p> : null}
            </div>
          </div>
          {requestError ? <p className="form-error opc-order-entry__request-error" role="alert">{requestError}</p> : null}
          <footer>
            <button type="button" onClick={() => setExpanded(false)} disabled={pending}>暂不下单</button>
            <button type="submit" disabled={pending}>{pending ? "正在生成订单" : "生成订单并前往支付宝"}</button>
          </footer>
        </form>
      )}
    </section>
  );
}
