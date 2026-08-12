"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { canonicalOpcPaymentReceiptUrl, downloadOpcPaymentReceiptPng, type OpcPaymentReceiptView as PaymentReceipt } from "@/lib/opc-payment-receipt-image";

type PublicOrderStatus = "awaiting_payment" | "payment_exception" | "paid_pending_contract" | "paid" | "refund_pending" | "completed" | "cancelled" | "refunded";
const labels: Record<PublicOrderStatus, string> = { awaiting_payment: "等待付款核验", payment_exception: "付款记录需人工核验", paid_pending_contract: "已付款，待合同确认", paid: "付款已核验", refund_pending: "退款处理中", completed: "服务订单已完成", cancelled: "订单已取消", refunded: "退款已确认" };

export function OpcPaymentReceipt({ reference }: { reference: string | null }) {
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [status, setStatus] = useState<PublicOrderStatus | null>(null);
  const [provider, setProvider] = useState<"retired_online" | "bank_transfer" | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "waiting" | "missing" | "error">(reference ? "loading" : "missing");
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const load = useCallback(async () => {
    if (!reference) return;
    const token = sessionStorage.getItem(`vault2077:opc:resume:${reference}`) ?? "";
    const response = await fetch(`/api/opc/orders/${encodeURIComponent(reference)}/receipt`, { method: "POST", headers: { "Content-Type": "application/json", "X-Vault2077-Public-Request": "1" }, body: JSON.stringify({ token }), cache: "no-store" });
    const body = await response.json().catch(() => null) as { receipt?: PaymentReceipt; orderStatus?: PublicOrderStatus; paymentProvider?: "retired_online" | "bank_transfer"; error?: unknown } | null;
    setStatus(body?.orderStatus ?? null); setProvider(body?.paymentProvider ?? null);
    if (response.status === 202) { setState("waiting"); return; }
    if (!response.ok || !body?.receipt) throw new Error(typeof body?.error === "string" ? body.error : "付款状态暂时无法读取。");
    setReceipt(body.receipt); setState("ready");
  }, [reference]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load().catch((cause) => {
      setState("error");
      setError(cause instanceof Error ? cause.message : "付款状态暂时无法读取。");
    }), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  if (state === "missing") return <div className="opc-payment-return__status"><h2>订单号待确认</h2><p>请从订单付款状态页面查看凭证。</p><Link href="/opc">返回 OPC 服务台</Link></div>;
  if (state === "error") return <div className="opc-payment-return__status"><h2>付款状态暂时无法读取</h2><p role="alert">{error}</p><button type="button" onClick={() => { setState("loading"); void load(); }}>重新读取</button></div>;
  if (state === "waiting") return <div className="opc-payment-return__status"><h2>{status === "cancelled" ? "订单已关闭" : "尚未确认付款"}</h2><p>{provider === "bank_transfer" ? "企业银行到账尚未由工作人员核验，请勿重复转账。" : "该历史在线付款渠道已经退役，不能继续发起或核验交易。"}</p><button type="button" onClick={() => { setState("loading"); void load(); }}>重新读取状态</button></div>;
  if (!receipt) return <div className="opc-payment-return__status" aria-live="polite"><h2>正在读取付款状态</h2></div>;
  const historical = receipt.payment.provider === "retired_online";
  return <article className="opc-payment-receipt"><header><p className="mono">PAYMENT RECEIPT / {receipt.receiptNumber}</p><h2>付款完成凭证</h2><p>{historical ? "该凭证来自已退役在线渠道的只读历史归档。" : "该凭证由后台按企业银行实际入账记录核对后生成。"}</p>{status ? <p className="opc-payment-receipt__order-status">当前订单状态：{labels[status]}</p> : null}</header>
    <ReceiptSection title="订单与服务" rows={[["订单号", receipt.reference], ["服务事项", receipt.service.name], ["服务编号 / 版本", `${receipt.service.code} / ${receipt.service.revision}`], ["服务成果", receipt.service.outcome], ["服务范围", receipt.service.scope], ["服务边界", receipt.service.boundary]]} />
    <ReceiptSection title="付款" rows={[["付款状态", historical ? "历史付款记录已归档" : "企业银行到账已由后台核验"], ["金额", `人民币 ${receipt.payment.amount.decimal} 元`], ["渠道", historical ? "退役在线渠道（历史记录）" : "线下对公转账"], [historical ? "历史交易参考号" : "银行流水号", receipt.payment.tradeNo], ["付款时间", formatDate(receipt.payment.paidAt)]]} />
    <ReceiptSection title="交易双方" rows={[["我方名称", receipt.operator.name], ["我方统一社会信用代码", receipt.operator.creditCode], ["付款方", receipt.customer.organizationName || receipt.customer.name], ["付款方统一社会信用代码", receipt.customer.organizationCreditCode || "—"], ["法定代表人", receipt.customer.legalRepresentativeName || "—"], ["联系人", `${receipt.customer.contactName} / ${receipt.customer.maskedPhone}`]]} />
    <footer><p>本凭证不是发票；到账核验及订单协议以系统留存记录为准。</p><p>{canonicalOpcPaymentReceiptUrl(receipt)} · {receipt.operator.icpNumber}</p><button type="button" onClick={() => { void downloadOpcPaymentReceiptPng(receipt).then(() => setDownloaded(true)); }}>{downloaded ? "付款凭证图片已下载" : "下载付款凭证截图（PNG）"}</button></footer></article>;
}

function ReceiptSection({ title, rows }: { title: string; rows: Array<[string, string]> }) { return <section><h3>{title}</h3><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl></section>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium", hour12: false }).format(new Date(value)); }
