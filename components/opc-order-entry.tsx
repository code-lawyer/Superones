"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  clearFieldError,
  isValidEmail,
} from "@/lib/client-form-validation";
import type { OpcService } from "@/lib/opc-catalog";
import { isOfficialEsignUrl } from "@/lib/opc-esign-url";

type OrderField = "name" | "phone" | "email" | "wechat" | "organizationName" | "organizationCreditCode" | "legalRepresentativeName" | "consent";
type OrderErrors = Partial<Record<OrderField, string>>;

type CreatedOrder = {
  id: string;
  reference: string;
  status: "awaiting_signature";
  signatureStatus: string;
  serviceName: string;
  quotedPrice: string;
  createdAt: string;
};

const fieldOrder: readonly OrderField[] = ["organizationName", "organizationCreditCode", "legalRepresentativeName", "name", "phone", "email", "wechat", "consent"];
const orderRequestTimeoutMs = 20_000;

function focusFirstOrderError(errors: OrderErrors) {
  const firstField = fieldOrder.find((field) => Boolean(errors[field]));
  if (!firstField) return;
  requestAnimationFrame(() => document.getElementById(`opc-order-${firstField}`)?.focus());
}

function validPhone(value: string) {
  return /^(?:\+?86)?1[3-9]\d{9}$/.test(value.replace(/[\s-]/g, ""));
}

function validSigningUrl(value: string) {
  try {
    const url = new URL(value);
    return isOfficialEsignUrl(value)
      || (process.env.NODE_ENV !== "production" && url.origin === window.location.origin && url.pathname === "/opc/sign/mock");
  } catch {
    return false;
  }
}

export function OpcOrderEntry({ service, returnHref }: {
  service: OpcService;
  returnHref: string;
}) {
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const [name, setName] = useState("");
  const [signerType, setSignerType] = useState<"individual" | "organization">("individual");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationCreditCode, setOrganizationCreditCode] = useState("");
  const [legalRepresentativeName, setLegalRepresentativeName] = useState("");
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
  const [signUrl, setSignUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestAbortRef.current?.abort();
    };
  }, []);

  function validate() {
    const next: OrderErrors = {};
    if (name.trim().length < 2) next.name = "请填写至少 2 个字的联系人姓名。";
    if (!validPhone(phone)) next.phone = "签署身份核验需要有效的中国大陆手机号。";
    if (signerType === "organization") {
      if (organizationName.trim().length < 2) next.organizationName = "请填写完整组织名称。";
      if (!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(organizationCreditCode.trim().toUpperCase())) next.organizationCreditCode = "请填写有效的 18 位统一社会信用代码。";
      if (legalRepresentativeName.trim().length < 2) next.legalRepresentativeName = "首期只支持法定代表人本人签署，请填写其姓名。";
    }
    if (email.trim() && !isValidEmail(email.trim())) next.email = "请填写有效的联系邮箱。";
    if (wechat.trim() && wechat.trim().length < 2) next.wechat = "即时通讯账号至少需要 2 个字符。";
    if (!phone.trim() && !email.trim() && !wechat.trim()) {
      next.phone = "手机号、邮箱或即时通讯账号至少填写一项。";
    }
    if (!consent) next.consent = "请确认订单登记与隐私说明。";
    setErrors(next);
    focusFirstOrderError(next);
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
    if (submittingRef.current) return;
    if (!validate()) return;
    submittingRef.current = true;
    setPending(true);
    setRequestError("");
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), orderRequestTimeoutMs);
    try {
      const response = await fetch("/api/opc/orders", {
        method: "POST",
        signal: controller.signal,
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
          signerType,
          organizationName,
          organizationCreditCode,
          legalRepresentativeName,
        }),
      });
      const body = await response.json().catch(() => null) as {
        error?: unknown;
        order?: CreatedOrder;
        signUrl?: unknown;
      } | null;
      if (
        !response.ok
        || !body?.order
        || typeof body.signUrl !== "string"
        || !validSigningUrl(body.signUrl)
      ) {
        throw new Error(typeof body?.error === "string" ? body.error : "订单暂时无法创建，请稍后重试。");
      }
      setOrder(body.order);
      setSignUrl(body.signUrl);
      window.location.assign(body.signUrl);
    } catch (cause) {
      if (mountedRef.current) {
        setRequestError(controller.signal.aborted
          ? "订单请求超时。请检查网络连接后重试；重复提交不会重复创建订单。"
          : cause instanceof Error
            ? cause.message
            : "订单暂时无法创建，请稍后重试。");
      }
    } finally {
      window.clearTimeout(timeout);
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
      submittingRef.current = false;
      if (mountedRef.current) setPending(false);
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
    <section className="opc-order-entry" aria-labelledby={`opc-order-${service.slug}`}>
      {order && signUrl ? (
        <div className="opc-order-entry__payment" role="status">
          <div className="opc-order-entry__payment-copy">
            <p className="mono">SIGNATURE / 签署页面</p>
            <h3 ref={formHeadingRef} tabIndex={-1}>订单已登记，正在前往签署页面。</h3>
            <dl>
              <div><dt>订单号</dt><dd>{order.reference}</dd></div>
              <div><dt>服务</dt><dd>{order.serviceName}</dd></div>
              <div><dt>合同金额</dt><dd>{order.quotedPrice}</dd></div>
            </dl>
            <p>后台已经形成待签署订单。请在独立签署页面完成身份核验和签署；服务器核验签署完成后才会生成付款页面。</p>
            <a href={signUrl}>如果没有自动跳转，点击进入签署页面 <span aria-hidden="true">↗</span></a>
            <button type="button" onClick={() => void copyReference()} aria-live="polite">{copied ? "订单号已复制" : "复制订单号"}</button>
          </div>
        </div>
      ) : (
        <form
          className="opc-order-entry__form"
          onSubmit={submit}
          aria-busy={pending}
          aria-describedby={requestError ? "opc-order-request-error" : undefined}
          noValidate
        >
          <header>
            <p className="mono">CONTRACT / 签约信息</p>
            <h3 id={`opc-order-${service.slug}`} ref={formHeadingRef} tabIndex={-1}>确认签约方与联系人。</h3>
            <p>首期支持自然人，或由法定代表人本人代表组织签署。提交后进入独立签署页面，签完再付款。</p>
          </header>
          <div className="opc-order-entry__fields">
            <fieldset className="opc-order-entry__party">
              <legend>签约方类型</legend>
              <label><input type="radio" name="signerType" value="individual" checked={signerType === "individual"} onChange={() => setSignerType("individual")} disabled={pending} />自然人</label>
              <label><input type="radio" name="signerType" value="organization" checked={signerType === "organization"} onChange={() => setSignerType("organization")} disabled={pending} />法人 / 组织（法定代表人本人签署）</label>
            </fieldset>
            {signerType === "organization" ? <>
              <div className="form-field">
                <label htmlFor="opc-order-organizationName">组织全称</label>
                <input id="opc-order-organizationName" maxLength={160} value={organizationName} onChange={(event) => updateField("organizationName", () => setOrganizationName(event.target.value))} aria-invalid={Boolean(errors.organizationName)} aria-describedby={errors.organizationName ? "opc-order-organizationName-error" : undefined} disabled={pending} required />
                {errors.organizationName ? <p id="opc-order-organizationName-error" className="form-error">{errors.organizationName}</p> : null}
              </div>
              <div className="form-field">
                <label htmlFor="opc-order-organizationCreditCode">统一社会信用代码</label>
                <input id="opc-order-organizationCreditCode" maxLength={18} value={organizationCreditCode} onChange={(event) => updateField("organizationCreditCode", () => setOrganizationCreditCode(event.target.value.toUpperCase()))} aria-invalid={Boolean(errors.organizationCreditCode)} aria-describedby={errors.organizationCreditCode ? "opc-order-organizationCreditCode-error" : undefined} disabled={pending} required />
                {errors.organizationCreditCode ? <p id="opc-order-organizationCreditCode-error" className="form-error">{errors.organizationCreditCode}</p> : null}
              </div>
              <div className="form-field">
                <label htmlFor="opc-order-legalRepresentativeName">法定代表人姓名</label>
                <input id="opc-order-legalRepresentativeName" maxLength={60} value={legalRepresentativeName} onChange={(event) => updateField("legalRepresentativeName", () => setLegalRepresentativeName(event.target.value))} aria-invalid={Boolean(errors.legalRepresentativeName)} aria-describedby={errors.legalRepresentativeName ? "opc-order-legalRepresentativeName-error" : undefined} disabled={pending} required />
                {errors.legalRepresentativeName ? <p id="opc-order-legalRepresentativeName-error" className="form-error">{errors.legalRepresentativeName}</p> : null}
              </div>
            </> : null}
            <div className="form-field">
              <label htmlFor="opc-order-name">联系人姓名</label>
              <input id="opc-order-name" name="name" autoComplete="name" maxLength={60} value={name} onChange={(event) => updateField("name", () => setName(event.target.value))} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "opc-order-name-error" : undefined} disabled={pending} required />
              {errors.name ? <p id="opc-order-name-error" className="form-error">{errors.name}</p> : null}
            </div>
            <div className="form-field">
              <label htmlFor="opc-order-phone">签署手机号</label>
              <input id="opc-order-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(event) => updateField("phone", () => setPhone(event.target.value))} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "opc-order-phone-error" : undefined} disabled={pending} required />
              {errors.phone ? <p id="opc-order-phone-error" className="form-error">{errors.phone}</p> : null}
            </div>
            <div className="form-field">
              <label htmlFor="opc-order-email">邮箱（可选）</label>
              <input id="opc-order-email" name="email" type="email" autoComplete="email" maxLength={160} value={email} onChange={(event) => updateField("email", () => setEmail(event.target.value))} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "opc-order-email-error" : undefined} disabled={pending} />
              {errors.email ? <p id="opc-order-email-error" className="form-error">{errors.email}</p> : null}
            </div>
            <div className="form-field">
              <label htmlFor="opc-order-wechat">即时通讯账号（可选）</label>
              <input id="opc-order-wechat" name="wechat" autoComplete="off" maxLength={80} value={wechat} onChange={(event) => updateField("wechat", () => setWechat(event.target.value))} aria-invalid={Boolean(errors.wechat)} aria-describedby={errors.wechat ? "opc-order-wechat-error" : undefined} disabled={pending} />
              {errors.wechat ? <p id="opc-order-wechat-error" className="form-error">{errors.wechat}</p> : null}
            </div>
            <div className="form-field opc-order-entry__note">
              <label htmlFor="opc-order-note">情况说明（可选）</label>
              <textarea id="opc-order-note" name="note" rows={4} maxLength={800} value={note} onChange={(event) => setNote(event.target.value)} disabled={pending} />
              <p>不要填写身份证号、银行卡号、密码或尚未要求提交的业务材料。身份认证资料只在签署服务页面提交。</p>
            </div>
            <div className="opc-order-entry__honeypot" aria-hidden="true">
              <label htmlFor="opc-order-website">网站</label>
              <input id="opc-order-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </div>
            <div className="opc-order-entry__consent">
              <input id="opc-order-consent" type="checkbox" checked={consent} onChange={(event) => updateField("consent", () => setConsent(event.target.checked))} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? "opc-order-consent-error" : undefined} disabled={pending} />
              <label htmlFor="opc-order-consent">我已阅读并同意<Link href="/terms">服务条款</Link>与<Link href="/privacy">隐私说明</Link>，确认当前服务名称、公开价格与范围，并同意为生成、签署、核验服务协议及后续付款交付处理上述信息。</label>
              {errors.consent ? <p id="opc-order-consent-error" className="form-error">{errors.consent}</p> : null}
            </div>
          </div>
          {requestError ? <p className="form-error opc-order-entry__request-error" id="opc-order-request-error" role="alert">{requestError}</p> : null}
          <footer>
            <Link href={returnHref}>返回服务详情</Link>
            <button type="submit" disabled={pending}>
              <span aria-live="polite">{pending ? "正在生成待签协议…" : "生成协议并前往签署页面"}</span>
            </button>
          </footer>
        </form>
      )}
    </section>
  );
}
