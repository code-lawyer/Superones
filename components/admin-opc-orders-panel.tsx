"use client";

import type { FormEvent } from "react";
import type {
  AdminBankVerificationDraft,
  AdminBankVerificationField,
  AdminOpcOrder,
  AdminOpcOrderDossier,
  AdminOpcOrderStatus,
} from "@/lib/admin-contract";
import { ADMIN_OPC_ORDER_STATUS_LABELS } from "@/lib/admin-contract";
import { downloadOpcPaymentReceiptPng } from "@/lib/opc-payment-receipt-image";

const signatureStatusLabels: Record<string, string> = {
  preparing: "正在准备协议",
  awaiting_signer: "等待签署",
  completed: "签署完成",
  rejected: "已拒签",
  expired: "已过期",
  revoked: "已撤销",
  failed: "签署失败",
};

const signatureFailureLabels: Record<string, string> = {
  provider_request_failed: "签署供应商请求失败",
};

function OpcDossierView({ dossier }: { dossier: AdminOpcOrderDossier }) {
  const rows: Array<[string, string]> = [
    ["联系人", dossier.contact.name],
    ["手机号", dossier.contact.phone],
    ["居民身份证号码", dossier.contact.identityDocumentNumberMasked || "—"],
    ["邮箱", dossier.contact.email || "—"],
    ["即时通讯", dossier.contact.wechat || "—"],
    ["备注", dossier.contact.note || "—"],
    ["签约方类型", dossier.signer.type === "organization" ? "法人 / 组织" : "自然人"],
    ["签约方", dossier.signer.organizationName || dossier.signer.name],
    ["统一社会信用代码", dossier.signer.organizationCreditCode || "—"],
    ["法定代表人", dossier.signer.legalRepresentativeName || "—"],
    ["纸质合同收件人", dossier.delivery?.recipientName ?? "—"],
    ["收件手机号", dossier.delivery?.phone ?? "—"],
    ["完整寄送地址", dossier.delivery ? `${dossier.delivery.province}${dossier.delivery.city}${dossier.delivery.district}${dossier.delivery.addressLine}` : "—"],
    ["服务范围", dossier.service.scope],
    ["服务边界", dossier.service.boundary],
    [dossier.payment.provider === "bank_transfer" ? "银行流水号" : "历史交易参考号", dossier.payment.tradeNo ?? "—"],
    ["付款凭证", dossier.paymentReceipt?.receiptNumber ?? "—"],
    ["凭证金额", dossier.paymentReceipt ? `人民币 ${dossier.paymentReceipt.payment.amount.decimal} 元` : "—"],
    ["凭证付款方", dossier.paymentReceipt ? dossier.paymentReceipt.customer.organizationName || dossier.paymentReceipt.customer.name : "—"],
    ["凭证运营方", dossier.paymentReceipt?.operator.name ?? "—"],
    ["在线协议版本", dossier.checkoutAgreement?.version ?? "—"],
    ["在线协议 SHA-256", dossier.checkoutAgreement?.sha256 ?? "—"],
    ["退款", dossier.refund ? `${dossier.refund.status} / ¥${dossier.refund.amount.decimal} / ${dossier.refund.reason}` : "—"],
    ["客户退款申请", dossier.refundApplication ? `${dossier.refundApplication.requestedAt} / ${dossier.refundApplication.reason}` : "—"],
  ];
  return <section className="admin-opc-dossier" aria-label={`${dossier.reference} 完整订单资料`}>
    <h4>完整订单 dossier</h4>
    <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {dossier.paymentReceipt ? <button className="text-link" type="button" onClick={() => void downloadOpcPaymentReceiptPng(dossier.paymentReceipt!)}>下载付款凭证截图（PNG）</button> : null}
    {dossier.checkoutAgreement ? <details><summary>在线协议完整正文：{dossier.checkoutAgreement.title}</summary><pre className="admin-opc-dossier__agreement">{dossier.checkoutAgreement.text}</pre></details> : null}
    <details><summary>审计记录（{dossier.auditTrail.length}）</summary><ol>{dossier.auditTrail.map((event) => <li key={`${event.occurredAt}-${event.action}`}><span className="mono">{event.occurredAt}</span> · {event.action} · {event.result}{event.reason ? ` · ${event.reason}` : ""}</li>)}</ol></details>
  </section>;
}

export function AdminOpcOrdersPanel({
  orders,
  dossiers,
  bankDraft,
  pending,
  onViewDossier,
  onDownloadArtifact,
  onReconcileSignature,
  onUpdateStatus,
  onOpenBankVerification,
  onCloseBankVerification,
  onUpdateBankVerification,
  onSetBankEvidenceConfirmed,
  onVerifyBankTransfer,
  onPaperAction,
}: {
  orders: AdminOpcOrder[];
  dossiers: Record<string, AdminOpcOrderDossier>;
  bankDraft: AdminBankVerificationDraft | null;
  pending: boolean;
  onViewDossier(order: AdminOpcOrder): void;
  onDownloadArtifact(order: AdminOpcOrder, kind: "contract" | "contact"): void;
  onReconcileSignature(order: AdminOpcOrder): void;
  onUpdateStatus(order: AdminOpcOrder, status: AdminOpcOrderStatus): void;
  onOpenBankVerification(order: AdminOpcOrder): void;
  onCloseBankVerification(order: AdminOpcOrder): void;
  onUpdateBankVerification(field: Exclude<AdminBankVerificationField, "evidenceConfirmed">, value: string): void;
  onSetBankEvidenceConfirmed(value: boolean): void;
  onVerifyBankTransfer(event: FormEvent<HTMLFormElement>, order: AdminOpcOrder): void;
  onPaperAction(order: AdminOpcOrder, action: "approve-contract" | "refund"): void;
}) {
  return <section className="admin-donations admin-opc-orders" id="admin-opc-orders" aria-labelledby="admin-opc-orders-title">
    <div className="admin-section-heading">
      <p className="eyebrow mono">OPC / ORDER OPERATIONS</p>
      <h2 id="admin-opc-orders-title">订单与到账核验</h2>
      <p className="form-note">旧在线支付已经退役；线下订单以企业银行实际入账记录为准。管理员重新验证身份后，按固定金额、付款户名、流水号和入账时间确认到账。</p>
    </div>
    <div className="admin-donation-list">
      {orders.length === 0 ? <p className="ranking-empty">当前没有 OPC 订单。</p> : orders.map((order) => (
        <article key={order.id} id={`opc-order-${order.reference}`}>
          <div>
            <p className="mono muted">{order.reference} / {ADMIN_OPC_ORDER_STATUS_LABELS[order.status]}</p>
            <h3>{order.serviceName}</h3>
            <p>{order.serviceCode} · {order.serviceRevision} · {order.quotedPrice}</p>
            <p>协议方式 {order.signatureMethod === "paper" ? "纸质签约" : order.signatureMethod === "online" ? "在线确认协议" : "电子签约"}</p>
            <p>付款金额 ¥{order.payment.amount.decimal} · {order.payment.provider === "bank_transfer" ? "线下对公转账" : "退役在线渠道（历史记录）"}</p>
            <p>签约资料 {order.contactAvailable ? "已加密保存，重新验证后可导出" : "已按保留期清除"}</p>
          </div>
          <div className="admin-donation-meta">
            <strong>{order.contactAvailable ? "客户联系方式受保护" : "联系方式已按保留期清除"}</strong>
            <span className="mono">{order.contactAvailable ? "完整资料需重新验证后导出" : "无可导出的联系方式"}</span>
            <time className="mono">创建 {new Date(order.createdAt).toLocaleString("zh-CN", { hour12: false })}</time>
            <time className="mono">更新 {new Date(order.updatedAt).toLocaleString("zh-CN", { hour12: false })}</time>
            <span className="mono">付款状态 {order.payment.tradeStatus ?? "尚未回传"}</span>
            {order.signatureMethod === "electronic" ? <>
              <span className="mono">签署状态 {signatureStatusLabels[order.signature.status] ?? order.signature.status}</span>
              <span className="mono">签署流程 {order.signature.flowId ?? "—"}</span>
              <span className="mono">合同文件 {order.signature.fileId ?? "—"}</span>
              <span className="mono">模板 {order.signature.templateId ?? "—"} / {order.signature.templateVersion ?? "—"}</span>
              {order.signature.notifiedAt ? <time className="mono">签署通知 {new Date(order.signature.notifiedAt).toLocaleString("zh-CN", { hour12: false })}</time> : null}
              {order.signature.checkedAt ? <time className="mono">签署查询 {new Date(order.signature.checkedAt).toLocaleString("zh-CN", { hour12: false })}</time> : null}
              {order.signature.completedAt ? <time className="mono">签署完成 {new Date(order.signature.completedAt).toLocaleString("zh-CN", { hour12: false })}</time> : null}
              {order.signature.failureReason ? <span>签署异常 {signatureFailureLabels[order.signature.failureReason] ?? "未提供详细原因"}</span> : null}
              <span className="mono">合同归档 {order.signature.archive.status === "archived" && order.signature.archive.sha256 ? "已归档" : order.signature.provider === "legacy" ? "历史订单无电子归档" : order.signature.archive.status === "failed" ? "归档失败" : "待归档"}</span>
              {order.signature.archive.archivedAt ? <time className="mono">归档时间 {new Date(order.signature.archive.archivedAt).toLocaleString("zh-CN", { hour12: false })}</time> : null}
              {order.signature.archive.retainUntil ? <time className="mono">至少保留至 {new Date(order.signature.archive.retainUntil).toLocaleDateString("zh-CN")}</time> : null}
            </> : order.signatureMethod === "paper" ? <span className="mono">纸质合同门禁 {order.status === "paid_pending_contract" ? "待确认" : order.status === "refund_pending" || order.status === "refunded" ? "未通过，已进入退款" : order.status === "paid" || order.status === "completed" ? "已通过" : "待付款"}</span> : <span className="mono">协议版本 {order.payment.offlineProfileRevision ?? "—"}</span>}
            <span className="mono">{order.payment.provider === "bank_transfer" ? "银行流水号" : "历史交易参考号"} {order.payment.tradeNo ?? "—"}</span>
            {order.payment.notifiedAt ? <time className="mono">通知 {new Date(order.payment.notifiedAt).toLocaleString("zh-CN", { hour12: false })}</time> : null}
            {order.payment.checkedAt ? <time className="mono">查询 {new Date(order.payment.checkedAt).toLocaleString("zh-CN", { hour12: false })}</time> : null}
            {order.paymentReceipt ? <span className="mono">付款凭证 {order.paymentReceipt.receiptNumber}</span> : null}
            {order.notifications?.map((notification) => <span className="mono" key={notification.eventId}>付款邮件 {notification.recipient} / {notification.status} / 尝试 {notification.attempts}</span>)}
            {order.refund ? <span className="mono">退款 {order.refund.status} / ¥{order.refund.amount.decimal} / {order.refund.requestNo}</span> : null}
            {order.refundApplication ? <strong>客户已于 {new Date(order.refundApplication.requestedAt).toLocaleString("zh-CN", { hour12: false })} 提交退款申请，待人工联系处理</strong> : null}
          </div>
          {dossiers[order.id] ? <OpcDossierView dossier={dossiers[order.id]} /> : null}
          <div className="admin-actions">
            {order.contactAvailable ? <button className="text-action" type="button" disabled={pending} onClick={() => onViewDossier(order)}>查看完整订单 dossier</button> : null}
            {order.signature.archive.status === "archived" && order.signature.archive.sha256 ? <button className="text-action" type="button" disabled={pending} onClick={() => onDownloadArtifact(order, "contract")}>下载已签合同</button> : null}
            {order.contactAvailable ? <button className="text-link" type="button" disabled={pending} onClick={() => onDownloadArtifact(order, "contact")}>导出客户联系方式</button> : null}
            {order.status === "awaiting_signature" ? <><button className="text-action" type="button" disabled={pending} onClick={() => onReconcileSignature(order)}>查询签署状态</button><button className="text-link" type="button" disabled={pending} onClick={() => onUpdateStatus(order, "cancelled")}>取消订单</button></> : null}
            {order.status === "awaiting_payment" ? order.payment.provider === "bank_transfer" ? <><button id={`verify-bank-${order.id}`} className="text-action" type="button" disabled={pending} aria-expanded={bankDraft?.orderId === order.id} aria-controls={`bank-verification-${order.id}`} onClick={() => onOpenBankVerification(order)}>确认银行到账</button><button className="text-link" type="button" disabled={pending} onClick={() => onUpdateStatus(order, "cancelled")}>取消未付款订单</button></> : <button className="text-link" type="button" disabled={pending} onClick={() => onUpdateStatus(order, "cancelled")}>取消订单</button> : null}
            {order.status === "paid" ? <button className="text-action" type="button" disabled={pending} onClick={() => onUpdateStatus(order, "completed")}>标记交付完成</button> : null}
            {order.status === "paid_pending_contract" ? <button className="text-action" type="button" disabled={pending} onClick={() => onPaperAction(order, "approve-contract")}>确认收到已签纸质合同</button> : null}
          </div>
          {bankDraft?.orderId === order.id ? (
            <form id={`bank-verification-${order.id}`} className="admin-bank-verification" onSubmit={(event) => onVerifyBankTransfer(event, order)} noValidate>
              <header><p className="eyebrow mono">BANK EVIDENCE / 到账证据</p><h4>核对企业银行实际入账记录</h4><p>仅在银行端已经看到真实入账后提交。系统会锁定订单版本、固定金额、付款户名、流水号和北京时间，并留下不可变审计记录。</p></header>
              <dl className="admin-bank-verification__summary" aria-label="本次到账核验摘要"><div><dt>订单号</dt><dd>{order.reference}</dd></div><div><dt>固定金额</dt><dd>人民币 {order.payment.amount.decimal} 元</dd></div><div><dt>收款户名</dt><dd>{order.payment.accountName ?? "订单缺少账户快照"}</dd></div><div><dt>收款银行</dt><dd>{order.payment.bankName ?? "订单缺少银行快照"}</dd></div></dl>
              <div className="admin-bank-verification__fields">
                <div className="form-field">
                  <label htmlFor={`bank-transaction-${order.id}`}>银行流水号</label>
                  <input id={`bank-transaction-${order.id}`} value={bankDraft.bankTransactionId} onChange={(event) => onUpdateBankVerification("bankTransactionId", event.target.value)} maxLength={80} autoComplete="off" aria-invalid={Boolean(bankDraft.errors.bankTransactionId)} aria-describedby={bankDraft.errors.bankTransactionId ? `bank-transaction-error-${order.id}` : `bank-transaction-hint-${order.id}`} />
                  <p id={`bank-transaction-hint-${order.id}`}>系统会统一为大写并拒绝已绑定其他订单的流水号。</p>
                  {bankDraft.errors.bankTransactionId ? <p id={`bank-transaction-error-${order.id}`} className="form-error">{bankDraft.errors.bankTransactionId}</p> : null}
                </div>
                <div className="form-field">
                  <label htmlFor={`bank-payerName-${order.id}`}>付款户名</label>
                  <input id={`bank-payerName-${order.id}`} value={bankDraft.payerName} onChange={(event) => onUpdateBankVerification("payerName", event.target.value)} maxLength={160} autoComplete="off" aria-invalid={Boolean(bankDraft.errors.payerName)} aria-describedby={bankDraft.errors.payerName ? `bank-payer-error-${order.id}` : undefined} />
                  {bankDraft.errors.payerName ? <p id={`bank-payer-error-${order.id}`} className="form-error">{bankDraft.errors.payerName}</p> : null}
                </div>
                <div className="form-field">
                  <label htmlFor={`bank-paidAt-${order.id}`}>银行入账时间（北京时间）</label>
                  <input id={`bank-paidAt-${order.id}`} type="datetime-local" step="1" value={bankDraft.paidAt} onChange={(event) => onUpdateBankVerification("paidAt", event.target.value)} aria-invalid={Boolean(bankDraft.errors.paidAt)} aria-describedby={bankDraft.errors.paidAt ? `bank-paidAt-error-${order.id}` : `bank-paidAt-hint-${order.id}`} />
                  <p id={`bank-paidAt-hint-${order.id}`}>按银行回单填写，系统固定按 UTC+08:00 解释。</p>
                  {bankDraft.errors.paidAt ? <p id={`bank-paidAt-error-${order.id}`} className="form-error">{bankDraft.errors.paidAt}</p> : null}
                </div>
              </div>
              <div className="admin-bank-verification__confirmation"><input id={`bank-evidenceConfirmed-${order.id}`} type="checkbox" checked={bankDraft.evidenceConfirmed} onChange={(event) => onSetBankEvidenceConfirmed(event.target.checked)} aria-invalid={Boolean(bankDraft.errors.evidenceConfirmed)} aria-describedby={bankDraft.errors.evidenceConfirmed ? `bank-confirm-error-${order.id}` : undefined} /><label htmlFor={`bank-evidenceConfirmed-${order.id}`}>我已逐项核对企业银行实际入账记录，确认金额、付款户名、流水号和入账时间均与本订单一致。</label>{bankDraft.errors.evidenceConfirmed ? <p id={`bank-confirm-error-${order.id}`} className="form-error">{bankDraft.errors.evidenceConfirmed}</p> : null}</div>
              <footer><button className="text-action" type="submit" disabled={pending}>{pending ? "正在确认到账…" : "提交到账核验"}</button><button className="text-link" type="button" disabled={pending} onClick={() => onCloseBankVerification(order)}>取消并保留订单状态</button></footer>
            </form>
          ) : null}
        </article>
      ))}
    </div>
  </section>;
}
