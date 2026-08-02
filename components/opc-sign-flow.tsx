"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type PublicOrder = {
  reference: string;
  status: "awaiting_signature" | "awaiting_payment" | "payment_exception" | "paid" | "completed" | "cancelled" | "refunded";
  signatureStatus: string;
  serviceName: string;
  quotedPrice: string;
};

const signatureStatusLabels: Record<string, string> = {
  preparing: "正在准备协议",
  awaiting_signer: "等待签署",
  completed: "签署完成",
  rejected: "已拒签",
  expired: "已过期",
  revoked: "已撤销",
  failed: "签署失败",
};

async function postJson(url: string, body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Vault2077-Public-Request": "1" },
    body: JSON.stringify(body),
    signal,
  });
  const result = await response.json().catch(() => null) as { error?: unknown; order?: PublicOrder; paymentUrl?: unknown; paymentUnavailable?: unknown } | null;
  if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : "请求暂时无法完成。");
  return result;
}

export function OpcMockSignPage({ reference, token }: { reference: string; token: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function complete() {
    setPending(true);
    setError("");
    try {
      await postJson("/api/opc/esign/mock-complete", { order: reference, token }, AbortSignal.timeout(20_000));
      window.location.assign(`/opc/sign/return?order=${encodeURIComponent(reference)}&token=${encodeURIComponent(token)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "模拟签署失败。");
      setPending(false);
    }
  }

  return <section className="opc-sign-page" aria-labelledby="opc-mock-sign-title">
    <p className="mono">LOCAL SIGNING SIMULATOR</p>
    <h1 id="opc-mock-sign-title">开发环境签署模拟器</h1>
    <p>此页面只在非生产环境代替托管签署页面，用于验证“签署完成后才能付款”的业务链路。它不执行实名认证，也不产生有效电子合同。</p>
    <dl><div><dt>订单号</dt><dd>{reference}</dd></div><div><dt>动作</dt><dd>模拟签署完成</dd></div></dl>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <button type="button" onClick={() => void complete()} disabled={pending}>{pending ? "正在登记…" : "确认模拟签署"}</button>
    <Link href="/opc">取消并返回 OPC</Link>
  </section>;
}

export function OpcSignReturnPage({ reference, token }: { reference: string; token: string }) {
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const requestRef = useRef<AbortController | null>(null);
  const [paymentUnavailable, setPaymentUnavailable] = useState(false);

  async function reconcile() {
    setChecking(true);
    setError("");
    setPaymentUnavailable(false);
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const result = await postJson(`/api/opc/orders/${encodeURIComponent(reference)}/resume`, {
        token,
        paymentChannel: window.matchMedia("(max-width: 820px)").matches ? "wap" : "page",
      }, controller.signal);
      if (result?.order) setOrder(result.order);
      setPaymentUnavailable(result?.paymentUnavailable === true);
      if (typeof result?.paymentUrl === "string") {
        const url = new URL(result.paymentUrl);
        if (url.protocol === "https:" && ["openapi.alipay.com", "openapi-sandbox.dl.alipaydev.com"].includes(url.hostname)) {
          window.location.assign(url.toString());
          return;
        }
        throw new Error("付款页面地址未通过安全校验。");
      }
    } catch (cause) {
      setError(controller.signal.aborted ? "核验请求超时，请检查网络后重试。" : cause instanceof Error ? cause.message : "签署状态暂时无法核验。");
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) requestRef.current = null;
      setChecking(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void reconcile(), 0);
    return () => {
      window.clearTimeout(timeout);
      requestRef.current?.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const terminal = order && ["rejected", "expired", "revoked", "failed"].includes(order.signatureStatus);
  const signedWithoutPayment = order?.signatureStatus === "completed" && paymentUnavailable;
  return <section className="opc-sign-page" aria-busy={checking} aria-labelledby="opc-sign-return-title">
    <p className="mono">SIGNATURE RETURN / 签署核验</p>
    <h1 id="opc-sign-return-title">{checking ? "正在核验协议签署状态" : terminal ? "协议尚未完成签署" : signedWithoutPayment ? "协议已签，付款暂不可用" : "等待签署服务确认"}</h1>
    <p>{checking
      ? "服务器正在向签署服务主动查询结果。核验通过后将自动进入付款页面。"
      : terminal
        ? "本次签署已拒签、过期、撤销或失败，因此不会生成付款页面。你可以返回 OPC 重新发起订单。"
        : signedWithoutPayment
          ? "协议已经完成双方签署，但付款服务暂时不可用。订单会保留为待付款，请稍后重新核验并继续。"
        : "签署结果可能仍在同步。浏览器返回本身不会改变订单状态，请稍后再次核验。"}</p>
    <dl><div><dt>订单号</dt><dd>{order?.reference ?? reference}</dd></div>{order ? <div><dt>签署状态</dt><dd>{signatureStatusLabels[order.signatureStatus] ?? "状态同步中"}</dd></div> : null}</dl>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {!terminal ? <button type="button" onClick={() => void reconcile()} disabled={checking}>{checking ? "核验中…" : "重新核验并继续付款"}</button> : null}
    <Link href="/opc">返回 OPC 服务台</Link>
  </section>;
}
