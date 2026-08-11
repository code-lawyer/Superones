"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  canonicalOpcPaymentReceiptUrl,
  downloadOpcPaymentReceiptPng,
  type OpcPaymentReceiptView as PaymentReceipt,
} from "@/lib/opc-payment-receipt-image";

type PublicOrderStatus = "awaiting_payment" | "payment_exception" | "paid_pending_contract" | "paid" | "refund_pending" | "completed" | "cancelled" | "refunded";
const orderStatusLabels: Record<PublicOrderStatus, string> = {
  awaiting_payment: "等待付款核验",
  payment_exception: "付款已见但订单仍需人工核验",
  paid_pending_contract: "已付款，待寄送及确认纸质合同",
  paid: "付款已核验，服务可按订单协议开始",
  refund_pending: "支付宝全额退款处理中",
  completed: "服务订单已完成",
  cancelled: "订单已取消",
  refunded: "支付宝全额退款已确认",
};

export function OpcPaymentReceipt({ reference }: { reference: string | null }) {
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [orderStatus, setOrderStatus] = useState<PublicOrderStatus | null>(null);
  const [paymentProvider, setPaymentProvider] = useState<"alipay" | "bank_transfer" | null>(null);
  const [state, setState] = useState<"verifying" | "ready" | "status" | "missing" | "error">(reference ? "verifying" : "missing");
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);

  const load = useCallback(async () => {
    if (!reference) return;
    const token = sessionStorage.getItem(`vault2077:opc:resume:${reference}`) ?? "";
    const response = await fetch(`/api/opc/orders/${encodeURIComponent(reference)}/receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Vault2077-Public-Request": "1" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null) as { receipt?: PaymentReceipt; orderStatus?: PublicOrderStatus; paymentProvider?: "alipay" | "bank_transfer"; error?: unknown } | null;
    setOrderStatus(body?.orderStatus ?? null);
    setPaymentProvider(body?.paymentProvider ?? null);
    if (response.status === 202) {
      if (body?.orderStatus === "cancelled" || body?.orderStatus === "payment_exception") {
        setState("status");
        return "settled" as const;
      }
      setState("verifying");
      return "retry" as const;
    }
    if (!response.ok || !body?.receipt) throw new Error(typeof body?.error === "string" ? body.error : "付款状态暂时无法核验。");
    setReceipt(body.receipt);
    setState("ready");
    return "ready" as const;
  }, [reference]);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      try {
        const result = await load();
        if (!cancelled && result === "retry" && attempts < 20) {
          attempts += 1;
          window.setTimeout(() => void poll(), Math.min(15_000, 3_000 * attempts));
        } else if (!cancelled && result === "retry") {
          setState("status");
        }
      } catch (cause) {
        if (!cancelled) {
          setState("error");
          setError(cause instanceof Error ? cause.message : "付款状态暂时无法核验。");
        }
      }
    };
    void poll();
    return () => { cancelled = true; };
  }, [load, reference]);

  async function retryVerification() {
    setState("verifying");
    setError("");
    try {
      const result = await load();
      if (result === "retry") setState("status");
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "核验失败。");
    }
  }

  async function continuePayment() {
    if (!reference) return;
    setState("verifying");
    setError("");
    try {
      const token = sessionStorage.getItem(`vault2077:opc:resume:${reference}`) ?? "";
      const response = await fetch(`/api/opc/orders/${encodeURIComponent(reference)}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Vault2077-Public-Request": "1" },
        body: JSON.stringify({
          token,
          paymentChannel: window.matchMedia("(max-width: 720px)").matches ? "wap" : "page",
        }),
      });
      const body = await response.json().catch(() => null) as { paymentUrl?: unknown; error?: unknown } | null;
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "暂时无法继续付款。");
      if (typeof body?.paymentUrl !== "string" || !validAlipayPaymentUrl(body.paymentUrl)) {
        await retryVerification();
        return;
      }
      window.location.assign(body.paymentUrl);
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "暂时无法继续付款。");
    }
  }

  async function downloadReceiptImage() {
    if (!receipt) return;
    await downloadOpcPaymentReceiptPng(receipt);
    setDownloaded(true);
  }

  if (state === "missing") return <div className="opc-payment-return__status"><h2>订单号待确认</h2><p>请从订单付款状态页面查看凭证。</p><Link href="/opc">返回 OPC 服务台</Link></div>;
  if (state === "error") return <div className="opc-payment-return__status"><h2>付款状态暂未确认</h2><p role="alert">{error}</p><button type="button" onClick={() => void retryVerification()}>重新核验</button></div>;
  if (state === "status" && orderStatus === "cancelled") return <div className="opc-payment-return__status"><h2>订单已关闭</h2><p>该订单已经取消，不能继续付款。</p><Link href="/opc">返回 OPC 服务台</Link></div>;
  if (state === "status" && orderStatus === "payment_exception") return <div className="opc-payment-return__status"><h2>付款需要人工核验</h2><p>系统已发现付款证据，但尚未通过订单金额或收款身份核验。请勿重复付款。</p><Link href="/legal">联系运营方处理</Link></div>;
  if (state === "status") return <div className="opc-payment-return__status"><h2>尚未确认付款</h2><p>{paymentProvider === "bank_transfer" ? "企业银行到账尚未由工作人员核验。请勿重复转账；如需确认，可使用付款页的联系人二维码沟通。" : "支付宝暂未返回可核验的成功交易。你可以继续付款或重新核验。"}</p><div>{paymentProvider === "alipay" ? <button type="button" onClick={() => void continuePayment()}>继续付款</button> : null}<button type="button" onClick={() => void retryVerification()}>重新核验</button></div></div>;
  if (!receipt) return <div className="opc-payment-return__status" aria-live="polite"><h2>正在核验付款</h2><p>{paymentProvider === "bank_transfer" ? "等待工作人员按企业银行入账记录核对固定金额与流水号。" : "服务器正在核对支付宝交易号、商户身份和固定订单金额，请勿重复付款。"}</p></div>;

  return <article className="opc-payment-receipt">
    <header>
      <p className="mono">PAYMENT RECEIPT / {receipt.receiptNumber}</p>
      <h2>付款完成凭证</h2>
      <p>{receipt.payment.provider === "bank_transfer" ? "该凭证由后台按企业银行实际入账记录核对固定金额和流水号后生成。" : "该凭证由服务器在支付宝交易验签并核对固定金额后生成。"}</p>
      {orderStatus ? <p className="opc-payment-receipt__order-status" aria-live="polite">当前订单状态：{orderStatusLabels[orderStatus]}</p> : null}
    </header>
    <ReceiptSection title="订单与服务" rows={[
      ["订单号", receipt.reference],
      ["服务事项", receipt.service.name],
      ["服务编号 / 版本", `${receipt.service.code} / ${receipt.service.revision}`],
      ["服务成果", receipt.service.outcome],
      ["服务范围", receipt.service.scope],
      ["服务边界", receipt.service.boundary],
    ]} />
    <ReceiptSection title="付款" rows={[
      ["付款状态", receipt.paymentStatus === "verified_paid" ? (receipt.payment.provider === "bank_transfer" ? "企业银行到账已由后台核验" : "支付宝付款已由服务器核验") : "—"],
      ["金额", `人民币 ${receipt.payment.amount.decimal} 元`],
      ["渠道", receipt.payment.provider === "bank_transfer" ? "线下对公转账" : "支付宝"],
      [receipt.payment.provider === "bank_transfer" ? "银行流水号" : "支付宝交易号", receipt.payment.tradeNo],
      ["付款时间", formatDate(receipt.payment.paidAt)],
    ]} />
    <ReceiptSection title="交易双方" rows={[
      ["我方名称", receipt.operator.name],
      ["我方统一社会信用代码", receipt.operator.creditCode],
      ["付款方", receipt.customer.organizationName || receipt.customer.name],
      ["付款方统一社会信用代码", receipt.customer.organizationCreditCode || "—"],
      ["法定代表人", receipt.customer.legalRepresentativeName || "—"],
      ["联系人", `${receipt.customer.contactName} / ${receipt.customer.maskedPhone}`],
      ...(receipt.customer.maskedDeliveryAddress ? [["合同寄送地址", receipt.customer.maskedDeliveryAddress] as [string, string]] : []),
    ]} />
    <footer>
      <p>本凭证不是发票；到账核验及订单协议以系统留存记录为准。</p>
      <p>{canonicalOpcPaymentReceiptUrl(receipt)} · {receipt.operator.icpNumber}</p>
      <button type="button" onClick={() => void downloadReceiptImage()}>{downloaded ? "付款凭证图片已下载" : "下载付款凭证截图（PNG）"}</button>
    </footer>
  </article>;
}

function validAlipayPaymentUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["openapi.alipay.com", "openapi-sandbox.dl.alipaydev.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

function ReceiptSection({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return <section><h3>{title}</h3><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl></section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium", hour12: false }).format(new Date(value));
}
