"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { clearFieldError, isValidEmail } from "@/lib/client-form-validation";
import type { buildOpcOfflineCheckoutAgreement } from "@/lib/opc-offline-checkout-agreement";
import type { PublicOpcOfflinePaymentProfile } from "@/lib/opc-offline-payment-profile";
import type { OpcService } from "@/lib/opc-catalog";
import { isValidOpcOrderReference } from "@/lib/opc-order-reference";
import { isValidPrcIdentityCard, normalizePrcIdentityCard } from "@/lib/prc-identity-card";

type OrderField =
  | "name" | "phone" | "email"
  | "identityDocumentNumber" | "identityConsentAccepted"
  | "organizationName" | "organizationCreditCode"
  | "agreementAccepted";
type OrderErrors = Partial<Record<OrderField, string>>;
type OfflineAgreement = ReturnType<typeof buildOpcOfflineCheckoutAgreement>;

type CreatedOrder = {
  id: string;
  reference: string;
  status: "awaiting_payment";
  signatureMethod: "online";
  serviceName: string;
  quotedPrice: string;
  paymentProvider: "bank_transfer";
  transferMemo: string;
  paymentAmount: { currency: "CNY"; minorUnits: number; decimal: string };
  createdAt: string;
};

const fieldOrder: readonly OrderField[] = [
  "organizationName", "organizationCreditCode",
  "name", "phone", "identityDocumentNumber", "email", "agreementAccepted", "identityConsentAccepted",
];
const orderRequestTimeoutMs = 20_000;
const subscribeToSessionStorage = () => () => undefined;
const dialogFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "iframe",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function readLastOrderReference() {
  const reference = sessionStorage.getItem("vault2077:opc:last-order");
  return reference && isValidOpcOrderReference(reference) ? reference : null;
}

function validPhone(value: string) {
  return /^(?:\+?86)?1[3-9]\d{9}$/.test(value.replace(/[\s-]/g, ""));
}

export function OpcOrderEntry({
  service,
  returnHref,
  checkoutAgreement,
  agreementSha256,
  paymentProfile,
}: {
  service: OpcService;
  returnHref: string;
  checkoutAgreement: OfflineAgreement;
  agreementSha256: string;
  paymentProfile: PublicOpcOfflinePaymentProfile;
}) {
  const [signerType, setSignerType] = useState<"individual" | "organization">("individual");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [identityDocumentNumber, setIdentityDocumentNumber] = useState("");
  const [wechat, setWechat] = useState("");
  const [note, setNote] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationCreditCode, setOrganizationCreditCode] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [identityConsentAccepted, setIdentityConsentAccepted] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<OrderErrors>({});
  const [requestError, setRequestError] = useState("");
  const [paymentAssetError, setPaymentAssetError] = useState("");
  const [pending, setPending] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const lastOrderReference = useSyncExternalStore(subscribeToSessionStorage, readLastOrderReference, () => null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const agreementTriggerRef = useRef<HTMLButtonElement | null>(null);
  const agreementPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([paymentProfile.agreement.href, paymentProfile.contactQr.href].map(async (href) => {
      const response = await fetch(href, { method: "HEAD", cache: "no-store" });
      return response.ok;
    }))
      .then((results) => {
        if (!cancelled && results.some((available) => !available)) {
          setPaymentAssetError("付款资料已更新，请刷新页面后重新核对企业账户、协议和联系人二维码。");
        }
      })
      .catch(() => {
        if (!cancelled) setPaymentAssetError("付款资料暂时无法核验，请刷新页面后重试。");
      });
    return () => { cancelled = true; };
  }, [paymentProfile.agreement.href, paymentProfile.contactQr.href]);

  useEffect(() => {
    if (!agreementOpen) return;
    const panel = agreementPanelRef.current;
    if (!panel) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const initialFocus = panel.querySelector<HTMLElement>("[data-agreement-initial-focus]") ?? panel;
    initialFocus.focus();

    function onAgreementKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setAgreementOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(panel!.querySelectorAll<HTMLElement>(dialogFocusableSelector))
        .filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        panel!.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onAgreementKeyDown);
    return () => {
      document.removeEventListener("keydown", onAgreementKeyDown);
      document.body.style.overflow = previousOverflow;
      agreementTriggerRef.current?.focus();
    };
  }, [agreementOpen]);

  function openAgreement(trigger: HTMLButtonElement) {
    agreementTriggerRef.current = trigger;
    setAgreementOpen(true);
  }

  function closeAgreement() {
    setAgreementOpen(false);
  }

  function updateField(field: OrderField, update: () => void) {
    update();
    setErrors((current) => clearFieldError(current, field));
  }

  function validate() {
    const next: OrderErrors = {};
    if (signerType === "organization") {
      if (organizationName.trim().length < 2) next.organizationName = "请填写组织全称。";
      if (!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(organizationCreditCode.trim().toUpperCase())) next.organizationCreditCode = "请填写有效的 18 位统一社会信用代码。";
    }
    if (name.trim().length < 2) next.name = "请填写签约联系人的真实姓名。";
    if (!validPhone(phone)) next.phone = "请填写有效的中国大陆手机号。";
    if (!isValidPrcIdentityCard(identityDocumentNumber)) next.identityDocumentNumber = "请填写有效的 18 位居民身份证号码。";
    if (!isValidEmail(email.trim())) next.email = "请填写用于接收订单和到账通知的有效邮箱。";
    if (!agreementAccepted) next.agreementAccepted = "请阅读并确认服务协议与线下付款规则。";
    if (!identityConsentAccepted) next.identityConsentAccepted = "请单独确认签约身份信息的必要处理。";
    setErrors(next);
    const first = fieldOrder.find((field) => next[field]);
    if (first) requestAnimationFrame(() => document.getElementById(`opc-order-${first}`)?.focus());
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || !validate()) return;
    submittingRef.current = true;
    setPending(true);
    setRequestError("");
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), orderRequestTimeoutMs);
    try {
      const response = await fetch("/api/opc/orders", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-Vault2077-Public-Request": "1" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current,
          signatureMethod: "online",
          paymentMethod: "offline_bank_transfer",
          paymentProfileRevision: paymentProfile.revision,
          serviceKind: service.kind,
          serviceSlug: service.slug,
          serviceRevision: service.revision,
          agreementVersion: checkoutAgreement.version,
          agreementSha256,
          signerType,
          name, phone, email, identityDocumentNumber: normalizePrcIdentityCard(identityDocumentNumber), wechat, note,
          organizationName, organizationCreditCode,
          agreementAccepted,
          identityConsentAccepted,
          website,
        }),
      });
      const body = await response.json().catch(() => null) as {
        error?: unknown;
        order?: CreatedOrder;
        resumeToken?: unknown;
      } | null;
      if (!response.ok || !body?.order || body.order.paymentProvider !== "bank_transfer" || typeof body.resumeToken !== "string") {
        throw new Error(typeof body?.error === "string" ? body.error : "线下付款单暂时无法创建，请稍后重试。");
      }
      sessionStorage.setItem(`vault2077:opc:resume:${body.order.reference}`, body.resumeToken);
      sessionStorage.setItem("vault2077:opc:last-order", body.order.reference);
      setCreatedOrder(body.order);
    } catch (error) {
      setRequestError(controller.signal.aborted
        ? "订单请求超时，请检查网络后重试；重复提交不会重复创建订单。"
        : error instanceof Error ? error.message : "线下付款单暂时无法创建，请稍后重试。");
    } finally {
      window.clearTimeout(timeout);
      submittingRef.current = false;
      setPending(false);
    }
  }

  return (
    <section className="opc-order-entry" aria-labelledby={`opc-order-${service.slug}`}>
      <div className="opc-order-entry__signature-methods" role="group" aria-label="付款方式">
        <button type="button" disabled>线上付款 · 暂未开放</button>
        <button type="button" disabled aria-pressed="true">线下付款 · 对公转账</button>
      </div>

      <section className="opc-offline-payment" aria-labelledby="opc-offline-payment-title">
        <header>
          <p className="mono">OFFLINE PAYMENT / 线下付款</p>
          <h3 id="opc-offline-payment-title">转账前，所有核对信息都在这里。</h3>
        </header>
        {paymentAssetError ? <div className="opc-offline-payment__asset-error" role="alert">
          <p>{paymentAssetError}</p>
          <button type="button" onClick={() => window.location.reload()}>刷新付款资料</button>
        </div> : null}
        <div className="opc-offline-payment__grid">
          <section className="opc-offline-payment__account" aria-labelledby="opc-offline-account-title">
            <p className="mono">COMPANY ACCOUNT</p>
            <h4 id="opc-offline-account-title">企业收款账户</h4>
            <dl>
              <div><dt>户名</dt><dd>{paymentProfile.account.name}</dd></div>
              <div><dt>开户银行</dt><dd>{paymentProfile.account.bankName}</dd></div>
              <div><dt>开户支行</dt><dd>{paymentProfile.account.branchName}</dd></div>
              <div><dt>银行账号</dt><dd className="opc-offline-payment__number">{paymentProfile.account.accountNumber}</dd></div>
              {paymentProfile.account.cnapsCode ? <div><dt>联行号</dt><dd>{paymentProfile.account.cnapsCode}</dd></div> : null}
            </dl>
          </section>

          <section className="opc-offline-payment__agreement" aria-labelledby="opc-offline-agreement-title">
            <p className="mono">AGREEMENT PDF</p>
            <h4 id="opc-offline-agreement-title">服务协议</h4>
            <p>{checkoutAgreement.title}</p>
            <div>
              <button type="button" className="text-link" onClick={(event) => openAgreement(event.currentTarget)}>点击查看协议</button>
              <a href={paymentProfile.agreement.href} download={paymentProfile.agreement.fileName}>下载 PDF</a>
            </div>
          </section>

          <figure className="opc-offline-payment__qr">
            <Image src={paymentProfile.contactQr.href} alt="联系人二维码" width={260} height={260} unoptimized priority onError={() => setPaymentAssetError("联系人二维码已更新，请刷新页面后重新核对付款资料。")} />
            <figcaption>联系人二维码</figcaption>
          </figure>
        </div>
      </section>

      {createdOrder ? (
        <section className="opc-offline-order-created" aria-live="polite">
          <p className="mono">ORDER CREATED / 付款单已生成</p>
          <h3>请按固定金额转账，并在附言中填写订单号。</h3>
          <dl>
            <div><dt>订单号 / 付款附言</dt><dd>{createdOrder.transferMemo}</dd></div>
            <div><dt>固定金额</dt><dd>人民币 {createdOrder.paymentAmount.decimal} 元</dd></div>
            <div><dt>当前状态</dt><dd>等待银行到账核验</dd></div>
          </dl>
          <p>你也可以先扫描上方二维码沟通确认，确认后再转账。到账后由工作人员核验并推进服务。</p>
          <div className="opc-offline-order-created__actions">
            <Link href={`/opc/payment/return?order=${encodeURIComponent(createdOrder.reference)}`}>查看付款状态与凭证</Link>
            <Link href={returnHref}>返回服务详情</Link>
          </div>
        </section>
      ) : (
        <form className="opc-order-entry__form" onSubmit={submit} aria-busy={pending} noValidate>
          <header>
            <p className="mono">ORDER CONTACT / 订单信息</p>
            <h3 id={`opc-order-${service.slug}`}>留下付款方与联系人信息。</h3>
            <p>提交后生成唯一订单号和转账附言；此步骤不会自动扣款，也不会跳转到任何支付平台。</p>
          </header>

          <div className="opc-order-entry__fields">
            <fieldset className="opc-order-entry__party">
              <legend>付款／委托方类型</legend>
              <label><input type="radio" name="signerType" checked={signerType === "individual"} onChange={() => setSignerType("individual")} disabled={pending} />自然人</label>
              <label><input type="radio" name="signerType" checked={signerType === "organization"} onChange={() => setSignerType("organization")} disabled={pending} />法人 / 组织</label>
            </fieldset>

            {signerType === "organization" ? <>
              <Field id="organizationName" label="组织全称" value={organizationName} setValue={(value) => updateField("organizationName", () => setOrganizationName(value))} error={errors.organizationName} disabled={pending} />
              <Field id="organizationCreditCode" label="统一社会信用代码" value={organizationCreditCode} setValue={(value) => updateField("organizationCreditCode", () => setOrganizationCreditCode(value.toUpperCase()))} error={errors.organizationCreditCode} disabled={pending} maxLength={18} />
            </> : null}

            <Field id="name" label={signerType === "organization" ? "法定代表人真实姓名" : "签约人真实姓名"} value={name} setValue={(value) => updateField("name", () => setName(value))} error={errors.name} disabled={pending} autoComplete="name" />
            <Field id="phone" label={signerType === "organization" ? "法定代表人手机号" : "签约人手机号"} value={phone} setValue={(value) => updateField("phone", () => setPhone(value))} error={errors.phone} disabled={pending} type="tel" autoComplete="tel" />
            <Field id="identityDocumentNumber" label="居民身份证号码" value={identityDocumentNumber} setValue={(value) => updateField("identityDocumentNumber", () => setIdentityDocumentNumber(normalizePrcIdentityCard(value)))} error={errors.identityDocumentNumber} disabled={pending} autoComplete="off" maxLength={18} />
            <Field id="email" label="通知邮箱" value={email} setValue={(value) => updateField("email", () => setEmail(value))} error={errors.email} disabled={pending} type="email" autoComplete="email" required />
            <Field id="wechat" label="即时通讯账号（可选）" value={wechat} setValue={setWechat} disabled={pending} />

            <div className="form-field opc-order-entry__note">
              <label htmlFor="opc-order-note">情况说明（可选）</label>
              <textarea id="opc-order-note" rows={3} maxLength={800} value={note} onChange={(event) => setNote(event.target.value)} disabled={pending} />
            </div>

            <div className="opc-order-entry__honeypot" aria-hidden="true">
              <label htmlFor="opc-order-website">网站</label>
              <input id="opc-order-website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </div>

            <div className="opc-order-entry__consent">
              <input id="opc-order-agreementAccepted" type="checkbox" checked={agreementAccepted} onChange={(event) => updateField("agreementAccepted", () => setAgreementAccepted(event.target.checked))} aria-invalid={Boolean(errors.agreementAccepted)} aria-describedby={`opc-order-consent-details${errors.agreementAccepted ? " opc-order-agreementAccepted-error" : ""}`} disabled={pending} />
              <div className="opc-order-entry__consent-copy">
                <label htmlFor="opc-order-agreementAccepted">我已查看并同意以下内容</label>
                <p id="opc-order-consent-details"><button type="button" className="opc-inline-link" onClick={(event) => openAgreement(event.currentTarget)}>服务协议</button>、线下对公转账规则、<Link href="/terms">服务条款</Link>和<Link href="/privacy">隐私说明</Link>。</p>
              </div>
              {errors.agreementAccepted ? <p id="opc-order-agreementAccepted-error" className="form-error">{errors.agreementAccepted}</p> : null}
            </div>

            <div className="opc-order-entry__consent opc-order-entry__identity-consent">
              <input id="opc-order-identityConsentAccepted" type="checkbox" checked={identityConsentAccepted} onChange={(event) => updateField("identityConsentAccepted", () => setIdentityConsentAccepted(event.target.checked))} aria-invalid={Boolean(errors.identityConsentAccepted)} aria-describedby={`opc-order-identity-consent-details${errors.identityConsentAccepted ? " opc-order-identityConsentAccepted-error" : ""}`} disabled={pending} />
              <div className="opc-order-entry__consent-copy">
                <label htmlFor="opc-order-identityConsentAccepted">我单独同意处理签约身份信息</label>
                <p id="opc-order-identity-consent-details">姓名、手机号和居民身份证号码用于核验本订单签约主体。身份证号码加密保存，仅用于本订单的签约身份核验与依法留存，不用于营销、画像或与本订单无关的事项；姓名、手机号和邮箱还会用于订单履行及退款联系。详见<Link href="/privacy">隐私说明</Link>。</p>
              </div>
              {errors.identityConsentAccepted ? <p id="opc-order-identityConsentAccepted-error" className="form-error">{errors.identityConsentAccepted}</p> : null}
            </div>
          </div>

          {requestError ? <p className="form-error opc-order-entry__request-error" role="alert">{requestError}</p> : null}
          <footer>
            <div>
              <Link href={returnHref}>返回服务详情</Link>
              {lastOrderReference ? <Link href={`/opc/payment/return?order=${encodeURIComponent(lastOrderReference)}`}>查看最近订单付款状态与凭证</Link> : null}
            </div>
            <button type="submit" disabled={pending || Boolean(paymentAssetError)}>{pending ? "正在生成付款单…" : `生成线下付款单 · ${service.price}`}</button>
          </footer>
        </form>
      )}

      {agreementOpen ? (
        <div className="opc-agreement-modal" role="dialog" aria-modal="true" aria-labelledby="opc-agreement-modal-title" aria-describedby="opc-agreement-modal-description" onMouseDown={(event) => { if (event.currentTarget === event.target) closeAgreement(); }}>
          <div className="opc-agreement-modal__panel" ref={agreementPanelRef} tabIndex={-1}>
            <header>
              <div>
                <p className="mono">AGREEMENT / 协议</p>
                <h3 id="opc-agreement-modal-title">{checkoutAgreement.title}</h3>
              </div>
              <button type="button" aria-label="关闭协议" data-agreement-initial-focus onClick={closeAgreement}>×</button>
            </header>
            <div className="opc-agreement-modal__body" role="region" tabIndex={0} aria-label="协议正文与 PDF 预览">
              <p id="opc-agreement-modal-description">请阅读当前服务订单和线下对公转账约定；下方同时提供完整 PDF 预览与下载。</p>
              {checkoutAgreement.sections.map((section) => <section key={section.title}>
                <h4>{section.title}</h4>
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </section>)}
              <iframe src={paymentProfile.agreement.href} title="服务协议 PDF 预览" onError={() => setPaymentAssetError("服务协议已更新，请关闭弹窗并刷新付款页面。")} />
            </div>
            <footer>
              <a href={paymentProfile.agreement.href} download={paymentProfile.agreement.fileName}>下载完整 PDF</a>
              <button type="button" onClick={closeAgreement}>返回付款页</button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({ id, label, value, setValue, error, disabled, type = "text", autoComplete, maxLength = 160, required = false }: {
  id: string;
  label: string;
  value: string;
  setValue: (value: string) => void;
  error?: string;
  disabled: boolean;
  type?: string;
  autoComplete?: string;
  maxLength?: number;
  required?: boolean;
}) {
  const inputId = `opc-order-${id}`;
  const errorId = `${inputId}-error`;
  return <div className="form-field">
    <label htmlFor={inputId}>{label}</label>
    <input id={inputId} type={type} autoComplete={autoComplete} maxLength={maxLength} value={value} onChange={(event) => setValue(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} disabled={disabled} required={required} />
    {error ? <p id={errorId} className="form-error">{error}</p> : null}
  </div>;
}
