"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { clearFieldError, isValidEmail } from "@/lib/client-form-validation";
import type { OpcPaperCheckoutAgreement } from "@/lib/opc-checkout-agreement";
import type { OpcService } from "@/lib/opc-catalog";

type OrderField =
  | "name" | "phone" | "email"
  | "organizationName" | "organizationCreditCode" | "legalRepresentativeName"
  | "recipientName" | "deliveryPhone" | "province" | "city" | "district" | "addressLine"
  | "agreementAccepted";
type OrderErrors = Partial<Record<OrderField, string>>;

type CreatedOrder = {
  id: string;
  reference: string;
  status: "awaiting_payment";
  serviceName: string;
  quotedPrice: string;
  paymentAmount: { currency: "CNY"; minorUnits: number; decimal: string };
  createdAt: string;
};

const fieldOrder: readonly OrderField[] = [
  "organizationName", "organizationCreditCode", "legalRepresentativeName",
  "name", "phone", "email", "recipientName", "deliveryPhone",
  "province", "city", "district", "addressLine", "agreementAccepted",
];
const orderRequestTimeoutMs = 20_000;

function validPhone(value: string) {
  return /^(?:\+?86)?1[3-9]\d{9}$/.test(value.replace(/[\s-]/g, ""));
}

function validPaymentUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && (url.hostname === "openapi.alipay.com"
        || (process.env.NODE_ENV !== "production" && url.hostname === "openapi-sandbox.dl.alipaydev.com"));
  } catch {
    return false;
  }
}

export function OpcOrderEntry({
  service,
  returnHref,
  checkoutAgreement,
  agreementSha256,
}: {
  service: OpcService;
  returnHref: string;
  checkoutAgreement: OpcPaperCheckoutAgreement;
  agreementSha256: string;
}) {
  const [signerType, setSignerType] = useState<"individual" | "organization">("individual");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [wechat, setWechat] = useState("");
  const [note, setNote] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationCreditCode, setOrganizationCreditCode] = useState("");
  const [legalRepresentativeName, setLegalRepresentativeName] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [province, setProvince] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<OrderErrors>({});
  const [requestError, setRequestError] = useState("");
  const [pending, setPending] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const submittingRef = useRef(false);

  function updateField(field: OrderField, update: () => void) {
    update();
    setErrors((current) => clearFieldError(current, field));
  }

  function validate() {
    const next: OrderErrors = {};
    if (signerType === "organization") {
      if (organizationName.trim().length < 2) next.organizationName = "请填写组织全称。";
      if (!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(organizationCreditCode.trim().toUpperCase())) next.organizationCreditCode = "请填写有效的 18 位统一社会信用代码。";
      if (legalRepresentativeName.trim().length < 2) next.legalRepresentativeName = "请填写法定代表人姓名。";
    }
    if (name.trim().length < 2) next.name = "请填写联系人姓名。";
    if (!validPhone(phone)) next.phone = "请填写有效的中国大陆手机号。";
    if (email.trim() && !isValidEmail(email.trim())) next.email = "请填写有效邮箱。";
    if (recipientName.trim().length < 2) next.recipientName = "请填写纸质合同收件人。";
    if (!validPhone(deliveryPhone)) next.deliveryPhone = "请填写有效的收件手机号。";
    if (province.trim().length < 2) next.province = "请填写省或直辖市。";
    if (city.trim().length < 2) next.city = "请填写城市。";
    if (!district.trim()) next.district = "请填写区县。";
    if (addressLine.trim().length < 4) next.addressLine = "请填写详细地址。";
    if (!agreementAccepted) next.agreementAccepted = "请确认付款及纸质合同规则。";
    setErrors(next);
    const first = fieldOrder.find((field) => next[field]);
    if (first) requestAnimationFrame(() => document.getElementById(`opc-order-${first}`)?.focus());
    return Object.keys(next).length === 0;
  }

  function downloadOpcAgreement() {
    const blob = new Blob([checkoutAgreement.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `OPC-在线订单及纸质合同预付款协议-${service.code}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
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
          signatureMethod: "paper",
          serviceKind: service.kind,
          serviceSlug: service.slug,
          serviceRevision: service.revision,
          agreementVersion: checkoutAgreement.version,
          agreementSha256,
          signerType,
          name, phone, email, wechat, note,
          organizationName, organizationCreditCode, legalRepresentativeName,
          recipientName, deliveryPhone, province, city, district, addressLine,
          agreementAccepted,
          paymentChannel: window.matchMedia("(max-width: 720px)").matches ? "wap" : "page",
          website,
        }),
      });
      const body = await response.json().catch(() => null) as {
        error?: unknown;
        order?: CreatedOrder;
        paymentUrl?: unknown;
        resumeToken?: unknown;
      } | null;
      if (!response.ok || !body?.order || typeof body.paymentUrl !== "string" || !validPaymentUrl(body.paymentUrl) || typeof body.resumeToken !== "string") {
        throw new Error(typeof body?.error === "string" ? body.error : "订单暂时无法创建，请稍后重试。");
      }
      sessionStorage.setItem(`vault2077:opc:resume:${body.order.reference}`, body.resumeToken);
      sessionStorage.setItem("vault2077:opc:last-order", body.order.reference);
      window.location.assign(body.paymentUrl);
    } catch (error) {
      setRequestError(controller.signal.aborted
        ? "订单请求超时，请检查网络后重试；重复提交不会重复创建订单。"
        : error instanceof Error ? error.message : "订单暂时无法创建，请稍后重试。");
    } finally {
      window.clearTimeout(timeout);
      submittingRef.current = false;
      setPending(false);
    }
  }

  return (
    <section className="opc-order-entry" aria-labelledby={`opc-order-${service.slug}`}>
      <div className="opc-order-entry__signature-methods" role="group" aria-label="签约方式">
        <button type="button" disabled>电子签约</button>
        <button type="button" aria-pressed="true">纸质签约</button>
      </div>

      <form className="opc-order-entry__form" onSubmit={submit} aria-busy={pending} noValidate>
        <header>
          <p className="mono">PAPER CONTRACT / 纸质签约</p>
          <h3 id={`opc-order-${service.slug}`}>确认付款方、联系人与纸质合同寄送信息。</h3>
          <p>订单金额由服务目录固定并由服务器传给支付宝，付款页面不能自行填写或修改金额。</p>
        </header>

        <div className="opc-order-entry__fields">
          <fieldset className="opc-order-entry__party">
            <legend>签约方类型</legend>
            <label><input type="radio" name="signerType" checked={signerType === "individual"} onChange={() => setSignerType("individual")} disabled={pending} />自然人</label>
            <label><input type="radio" name="signerType" checked={signerType === "organization"} onChange={() => setSignerType("organization")} disabled={pending} />法人 / 组织</label>
          </fieldset>

          {signerType === "organization" ? <>
            <Field id="organizationName" label="组织全称" value={organizationName} setValue={(value) => updateField("organizationName", () => setOrganizationName(value))} error={errors.organizationName} disabled={pending} />
            <Field id="organizationCreditCode" label="统一社会信用代码" value={organizationCreditCode} setValue={(value) => updateField("organizationCreditCode", () => setOrganizationCreditCode(value.toUpperCase()))} error={errors.organizationCreditCode} disabled={pending} maxLength={18} />
            <Field id="legalRepresentativeName" label="法定代表人姓名" value={legalRepresentativeName} setValue={(value) => updateField("legalRepresentativeName", () => setLegalRepresentativeName(value))} error={errors.legalRepresentativeName} disabled={pending} />
          </> : null}

          <Field id="name" label="联系人姓名" value={name} setValue={(value) => updateField("name", () => setName(value))} error={errors.name} disabled={pending} autoComplete="name" />
          <Field id="phone" label="联系人手机号" value={phone} setValue={(value) => updateField("phone", () => { setPhone(value); if (!deliveryPhone) setDeliveryPhone(value); })} error={errors.phone} disabled={pending} type="tel" autoComplete="tel" />
          <Field id="email" label="邮箱（可选）" value={email} setValue={(value) => updateField("email", () => setEmail(value))} error={errors.email} disabled={pending} type="email" autoComplete="email" />
          <Field id="wechat" label="即时通讯账号（可选）" value={wechat} setValue={setWechat} disabled={pending} />

          <div className="form-field opc-order-entry__note">
            <label htmlFor="opc-order-note">情况说明（可选）</label>
            <textarea id="opc-order-note" rows={3} maxLength={800} value={note} onChange={(event) => setNote(event.target.value)} disabled={pending} />
          </div>

          <div className="opc-order-entry__delivery-heading">
            <p className="mono">DELIVERY / 合同寄送</p>
            <p>用于寄送正式纸质合同。打印及往返快递费由我方承担。</p>
          </div>
          <Field id="recipientName" label="收件人" value={recipientName} setValue={(value) => updateField("recipientName", () => setRecipientName(value))} error={errors.recipientName} disabled={pending} autoComplete="name" />
          <Field id="deliveryPhone" label="收件手机号" value={deliveryPhone} setValue={(value) => updateField("deliveryPhone", () => setDeliveryPhone(value))} error={errors.deliveryPhone} disabled={pending} type="tel" autoComplete="tel" />
          <Field id="province" label="省 / 直辖市" value={province} setValue={(value) => updateField("province", () => setProvince(value))} error={errors.province} disabled={pending} autoComplete="address-level1" />
          <Field id="city" label="城市" value={city} setValue={(value) => updateField("city", () => setCity(value))} error={errors.city} disabled={pending} autoComplete="address-level2" />
          <Field id="district" label="区 / 县" value={district} setValue={(value) => updateField("district", () => setDistrict(value))} error={errors.district} disabled={pending} autoComplete="address-level3" />
          <Field id="addressLine" label="详细地址" value={addressLine} setValue={(value) => updateField("addressLine", () => setAddressLine(value))} error={errors.addressLine} disabled={pending} autoComplete="street-address" maxLength={240} />

          <div className="opc-order-entry__honeypot" aria-hidden="true">
            <label htmlFor="opc-order-website">网站</label>
            <input id="opc-order-website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
          </div>

          <div className="opc-order-entry__agreement-copy">
            <h4>{checkoutAgreement.title}</h4>
            {checkoutAgreement.sections.map((section) => <section key={section.title}>
              <h5>{section.title}</h5>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>)}
            <button type="button" className="text-link" onClick={downloadOpcAgreement}>下载本版完整协议</button>
          </div>
          <div className="opc-order-entry__consent">
            <input id="opc-order-agreementAccepted" type="checkbox" checked={agreementAccepted} onChange={(event) => updateField("agreementAccepted", () => setAgreementAccepted(event.target.checked))} aria-invalid={Boolean(errors.agreementAccepted)} aria-describedby={errors.agreementAccepted ? "opc-order-agreementAccepted-error" : undefined} disabled={pending} />
            <label htmlFor="opc-order-agreementAccepted">我已阅读并同意上述付款、寄送与全额退款规则，并同意<Link href="/terms">服务条款</Link>及<Link href="/privacy">隐私说明</Link>。</label>
            {errors.agreementAccepted ? <p id="opc-order-agreementAccepted-error" className="form-error">{errors.agreementAccepted}</p> : null}
          </div>
        </div>

        {requestError ? <p className="form-error opc-order-entry__request-error" role="alert">{requestError}</p> : null}
        <footer>
          <Link href={returnHref}>返回服务详情</Link>
          <button type="submit" disabled={pending}>{pending ? "正在创建固定金额订单…" : `确认并前往支付宝支付 · ${service.price}`}</button>
        </footer>
      </form>
    </section>
  );
}

function Field({ id, label, value, setValue, error, disabled, type = "text", autoComplete, maxLength = 160 }: {
  id: string;
  label: string;
  value: string;
  setValue: (value: string) => void;
  error?: string;
  disabled: boolean;
  type?: string;
  autoComplete?: string;
  maxLength?: number;
}) {
  const inputId = `opc-order-${id}`;
  const errorId = `${inputId}-error`;
  return <div className="form-field">
    <label htmlFor={inputId}>{label}</label>
    <input id={inputId} type={type} autoComplete={autoComplete} maxLength={maxLength} value={value} onChange={(event) => setValue(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} disabled={disabled} />
    {error ? <p id={errorId} className="form-error">{error}</p> : null}
  </div>;
}
