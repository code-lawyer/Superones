"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  isValidOpcOrderReference,
  normalizeOpcOrderReference,
} from "@/lib/opc-order-reference";

type RefundOrder = {
  reference: string;
  status: string;
  serviceName: string;
  paymentAmount: { decimal: string };
  paymentProvider: "retired_online" | "bank_transfer";
  refundEligible: boolean;
  refundApplication: { status: "requested"; requestedAt: string } | null;
  actualRefundStatus: "pending" | "succeeded" | null;
};

const statusLabels: Record<string, string> = {
  awaiting_signature: "等待签约",
  awaiting_payment: "等待付款或到账核验",
  payment_exception: "付款状态需人工核对",
  paid_pending_contract: "已付款，合同处理中",
  paid: "已确认到账",
  refund_pending: "退款处理中",
  completed: "服务已完成",
  cancelled: "订单已取消",
  refunded: "已退款",
};

const refundRequestTimeoutMs = 20_000;

export function OpcRefundRequest({ initialReference = "" }: { initialReference?: string }) {
  const [reference, setReference] = useState(initialReference);
  const [order, setOrder] = useState<RefundOrder | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<"lookup" | "submit" | null>(null);

  function normalizedReference() {
    return normalizeOpcOrderReference(reference);
  }

  function resumeToken(orderReference: string) {
    return sessionStorage.getItem(`vault2077:opc:resume:${orderReference}`) ?? "";
  }

  async function callApi(action: "lookup" | "submit", orderReference: string) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), refundRequestTimeoutMs);
    try {
      const response = await fetch("/api/opc/refund-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Vault2077-Public-Request": "1" },
        body: JSON.stringify({
          action,
          reference: orderReference,
          token: resumeToken(orderReference),
          ...(action === "submit" ? { reason } : {}),
        }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null) as { order?: RefundOrder; error?: unknown } | null;
      if (!response.ok || !body?.order) {
        throw new Error(typeof body?.error === "string" ? body.error : "退款申请暂时无法处理，请稍后重试。");
      }
      return body.order;
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        throw new Error("退款申请请求超时，请检查网络后重试。");
      }
      throw requestError;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const orderReference = normalizedReference();
    setReference(orderReference);
    setOrder(null);
    setError("");
    if (!isValidOpcOrderReference(orderReference)) {
      setError("请输入完整订单号，例如 OPC-20260811-XXXXXXXXXXXX。");
      return;
    }
    setPending("lookup");
    try {
      setOrder(await callApi("lookup", orderReference));
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "订单暂时无法查询，请稍后重试。");
    } finally {
      setPending(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (reason.trim().length < 10) {
      setError("请至少用 10 个字符说明退款原因和希望客服协助的事项。");
      return;
    }
    if (!confirmed) {
      setError("请确认你理解退款申请需要人工核验，并不代表退款已经完成。");
      return;
    }
    const orderReference = normalizedReference();
    setPending("submit");
    try {
      setOrder(await callApi("submit", orderReference));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "退款申请暂时无法提交，请稍后重试。");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="opc-refund-workspace" aria-labelledby="opc-refund-title">
      <header>
        <p className="mono">REFUND REQUEST / 退款申请</p>
        <h2 id="opc-refund-title">先核对订单，再提交人工处理。</h2>
        <p>为保护订单资料，订单号之外还需要原下单浏览器保存的订单凭证。查询结果不会显示姓名、手机号、身份证号或银行资料。</p>
      </header>

      <form className="opc-refund-lookup" onSubmit={lookup} noValidate>
        <div className="form-field">
          <label htmlFor="opc-refund-reference">订单号</label>
          <input id="opc-refund-reference" value={reference} onChange={(event) => { setReference(event.target.value.toUpperCase()); setOrder(null); setError(""); }} placeholder="OPC-YYYYMMDD-XXXXXXXXXXXX" maxLength={25} autoComplete="off" spellCheck={false} aria-invalid={Boolean(error && !order)} aria-describedby={`opc-refund-reference-hint${error && !order ? " opc-refund-error" : ""}`} />
          <p id="opc-refund-reference-hint">请使用创建该订单时的同一浏览器查询。</p>
        </div>
        <button type="submit" disabled={pending !== null}>{pending === "lookup" ? "正在安全查询…" : "查询我的订单"}</button>
      </form>

      {error ? <p id="opc-refund-error" className="form-error opc-refund-error" role="alert">{error}</p> : null}

      {order ? <section className="opc-refund-order" aria-live="polite">
        <header>
          <p className="mono">VERIFIED ORDER / 已核对订单</p>
          <h3>{order.serviceName}</h3>
        </header>
        <dl>
          <div><dt>订单号</dt><dd>{order.reference}</dd></div>
          <div><dt>订单金额</dt><dd>人民币 {order.paymentAmount.decimal} 元</dd></div>
          <div><dt>付款方式</dt><dd>{order.paymentProvider === "bank_transfer" ? "线下对公转账" : "退役在线渠道（历史记录）"}</dd></div>
          <div><dt>当前状态</dt><dd>{statusLabels[order.status] ?? order.status}</dd></div>
        </dl>

        {order.refundApplication ? <div className="opc-refund-result" role="status">
          <p className="mono">REQUEST RECEIVED</p>
          <h3>退款申请已收到。</h3>
          <p>客服人员会通过原订单中留存的联系方式与你核对。申请提交时间：{new Date(order.refundApplication.requestedAt).toLocaleString("zh-CN", { hour12: false })}。</p>
          <p>此状态表示申请已经进入人工处理，并不表示款项已经退回。实际退款结果以客服确认和银行到账记录为准。</p>
        </div> : order.refundEligible ? <form className="opc-refund-application" onSubmit={submit} noValidate>
          <div className="form-field">
            <label htmlFor="opc-refund-reason">退款原因与需要协助的事项</label>
            <textarea id="opc-refund-reason" rows={6} minLength={10} maxLength={800} value={reason} onChange={(event) => { setReason(event.target.value); setError(""); }} aria-invalid={Boolean(error)} aria-describedby={`opc-refund-reason-hint${error ? " opc-refund-error" : ""}`} />
            <p id="opc-refund-reason-hint">请勿填写银行卡密码、短信验证码或新的身份证号码。客服会使用原订单联系方式与你核对。</p>
          </div>
          <label className="opc-refund-confirmation">
            <input type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setError(""); }} aria-invalid={Boolean(error)} aria-describedby={error ? "opc-refund-error" : undefined} />
            <span>我理解提交申请不等于退款完成；是否退款、退款金额及退款路径需要结合服务进度、合同约定和实际付款记录人工核验。</span>
          </label>
          <button type="submit" disabled={pending !== null}>{pending === "submit" ? "正在提交申请…" : "提交退款申请"}</button>
        </form> : <div className="opc-refund-unavailable">
          <h3>该订单当前不能新建退款申请。</h3>
          <p>{order.status === "awaiting_payment" ? "订单尚未确认到账，无需申请退款；如已转账，请先等待银行到账核验。" : order.actualRefundStatus ? "该订单已经进入实际退款流程，请以客服确认和银行到账记录为准。" : "请通过原订单联系人核对订单状态。"}</p>
        </div>}
      </section> : null}

      <footer>
        <Link href="/opc">返回 OPC 服务台</Link>
        <Link href="/privacy">查看隐私说明</Link>
      </footer>
    </section>
  );
}
