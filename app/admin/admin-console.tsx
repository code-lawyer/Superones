"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { AdminOpcCatalogEditor } from "@/components/admin-opc-catalog-editor";
import { reauthenticateAdminWithPasskey } from "@/lib/admin-passkey-browser";
import {
  downloadOpcPaymentReceiptPng,
  type OpcPaymentReceiptView as OpcPaymentReceiptData,
} from "@/lib/opc-payment-receipt-image";

type Submission = {
  id: string;
  repository: string;
  email: string;
  note: string;
  status: "pending" | "verified" | "settled" | "ineligible_at_settlement";
  createdAt: string;
  verifiedAt: string | null;
  baselineStars: number | null;
  currentStars: number | null;
  lastSnapshotAt: string | null;
};

type Donation = {
  id: string;
  season: string;
  name: string;
  description: string;
  email: string;
  status: "pending_confirmation" | "available" | "rejected" | "withdrawn" | "assigned" | "carried_over";
  createdAt: string;
  confirmedAt: string | null;
};

type FrontierSeasonConfiguration = {
  season: string;
  officialReward: string;
  rewardProvider: "边境计划管理局";
  taxNotice: "依法归属于获奖者的税费由获奖者承担；依法需代扣代缴的，由运营主体依法办理";
  rewardProcessOpenWithinDays: 7;
  status: "draft" | "published";
  updatedAt: string;
  publishedAt: string | null;
};

type ContentState = {
  mode: "demo" | "live" | "degraded";
  updatedAt: string | null;
  sourceCount: number;
  eventCount: number;
  projectCount: number;
};

type OpcOrderStatus = "awaiting_signature" | "awaiting_payment" | "payment_exception" | "paid_pending_contract" | "paid" | "refund_pending" | "completed" | "cancelled" | "refunded";

type OpcOrder = {
  id: string;
  reference: string;
  serviceCode: string;
  serviceName: string;
  serviceRevision: string;
  quotedPrice: string;
  signatureMethod: "paper" | "electronic" | "online";
  payment: {
    provider: "retired_online" | "bank_transfer";
    amount: {
      currency: "CNY";
      minorUnits: number;
      decimal: string;
    };
    tradeNo: string | null;
    tradeStatus: string | null;
    requestCreatedAt: string | null;
    notifiedAt: string | null;
    checkedAt: string | null;
    offlineProfileRevision: string | null;
    accountName: string | null;
    bankName: string | null;
    branchName: string | null;
    accountNumber: string | null;
    cnapsCode: string | null;
    transferMemo: string | null;
    agreementSha256: string | null;
    contactQrSha256: string | null;
  };
  contactAvailable: boolean;
  signature: {
    provider: "mock" | "esign" | "legacy";
    status: string;
    flowId: string | null;
    fileId: string | null;
    templateId: string | null;
    templateVersion: string | null;
    notifiedAt: string | null;
    checkedAt: string | null;
    completedAt: string | null;
    failureReason: string | null;
    archive: {
      status: "pending" | "archived" | "failed";
      sha256: string | null;
      sizeBytes: number | null;
      archivedAt: string | null;
      retainUntil: string | null;
      failureReason: string | null;
    };
  };
  status: OpcOrderStatus;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  completedAt: string | null;
  contactDeletedAt: string | null;
  paymentReceipt: OpcPaymentReceiptData | null;
  refund: { status: "pending" | "succeeded"; requestNo: string; reason: string; amount: { decimal: string }; requestedAt: string; completedAt: string | null } | null;
  refundApplication: { status: "requested"; requestedAt: string } | null;
  notifications: Array<{ eventId: string; recipient: string; status: string; attempts: number; sentAt: string | null }>;
};

type OpcOrderDossier = {
  id: string;
  reference: string;
  status: OpcOrderStatus;
  service: { code: string; name: string; revision: string; quotedPrice: string; period: string; outcome: string; scope: string; boundary: string };
  contact: { name: string; phone: string; email: string; wechat: string; note: string; identityDocumentNumberMasked?: string };
  signer: { type: "individual" | "organization"; name: string; organizationName: string; organizationCreditCode: string; legalRepresentativeName: string };
  delivery: { recipientName: string; phone: string; province: string; city: string; district: string; addressLine: string } | null;
  payment: OpcOrder["payment"];
  paymentReceipt: OpcPaymentReceiptData | null;
  checkoutAgreement: { version: string; title: string; text: string; sha256: string; acceptedAt: string } | null;
  refund: OpcOrder["refund"];
  refundApplication: { status: "requested"; reason: string; requestedAt: string } | null;
  notifications: OpcOrder["notifications"];
  auditTrail: Array<{ occurredAt: string; actorHash: string; action: string; result: "success" | "rejected" | "failed"; reason: string | null; diff: Record<string, unknown> }>;
};

type BankVerificationField = "bankTransactionId" | "payerName" | "paidAt" | "evidenceConfirmed";
type BankVerificationDraft = {
  orderId: string;
  bankTransactionId: string;
  payerName: string;
  paidAt: string;
  evidenceConfirmed: boolean;
  errors: Partial<Record<BankVerificationField, string>>;
};

type AdminLoginMode = "passkey" | "local-password";

type AdminPasskeyCredential = {
  credentialId: string;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

const opcOrderStatusLabels: Record<OpcOrderStatus, string> = {
  awaiting_signature: "待签署",
  awaiting_payment: "待付款",
  payment_exception: "到账异常（签约未放行）",
  paid_pending_contract: "已付款，待确认纸质合同",
  paid: "已到账",
  refund_pending: "全额退款处理中",
  completed: "已完成",
  cancelled: "已取消",
  refunded: "已退款",
};

const opcSignatureStatusLabels: Record<string, string> = {
  preparing: "正在准备协议",
  awaiting_signer: "等待签署",
  completed: "签署完成",
  rejected: "已拒签",
  expired: "已过期",
  revoked: "已撤销",
  failed: "签署失败",
};

const opcSignatureFailureLabels: Record<string, string> = {
  provider_request_failed: "签署供应商请求失败",
};

const adminMutationHeaders = {
  "Content-Type": "application/json",
  "X-Vault2077-Admin-Request": "1",
};

class AdminApiError extends Error {
  readonly code?: string;
  readonly reauthenticationUrl?: string;

  constructor(message: string, code?: string, reauthenticationUrl?: string) {
    super(message);
    this.name = "AdminApiError";
    this.code = code;
    this.reauthenticationUrl = reauthenticationUrl;
  }
}

async function jsonMessage(response: Response) {
  const body = await response.json().catch(() => null) as { error?: unknown; code?: unknown; reauthenticationUrl?: unknown; submissions?: Submission[]; donations?: Donation[]; seasonConfiguration?: FrontierSeasonConfiguration; state?: ContentState; orders?: OpcOrder[]; dossier?: OpcOrderDossier; order?: Partial<OpcOrder>; refreshed?: unknown; failed?: unknown } | null;
  if (!response.ok) {
    throw new AdminApiError(
      typeof body?.error === "string" ? body.error : "请求暂时无法完成。",
      typeof body?.code === "string" ? body.code : undefined,
      typeof body?.reauthenticationUrl === "string" ? body.reauthenticationUrl : undefined,
    );
  }
  return body;
}

function bankPaidAtToBeijingIso(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(trimmed)) return null;
  const timestamp = `${trimmed.length === 16 ? `${trimmed}:00` : trimmed}+08:00`;
  const parsed = new Date(timestamp);
  return Number.isFinite(parsed.getTime()) ? timestamp : null;
}

export function AdminConsole() {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [seasonConfiguration, setSeasonConfiguration] = useState<FrontierSeasonConfiguration | null>(null);
  const [seasonReward, setSeasonReward] = useState("");
  const [contentState, setContentState] = useState<ContentState | null>(null);
  const [orders, setOrders] = useState<OpcOrder[]>([]);
  const [opcDossiers, setOpcDossiers] = useState<Record<string, OpcOrderDossier>>({});
  const [bankVerificationDraft, setBankVerificationDraft] = useState<BankVerificationDraft | null>(null);
  const [passkeys, setPasskeys] = useState<AdminPasskeyCredential[]>([]);
  const [password, setPassword] = useState("");
  const [enrollmentToken, setEnrollmentToken] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [enrollmentRequired, setEnrollmentRequired] = useState(false);
  const [loginMode, setLoginMode] = useState<AdminLoginMode | null>(null);
  const [reauthenticationRequired, setReauthenticationRequired] = useState(false);
  const [reauthenticationUrl, setReauthenticationUrl] = useState("");
  const [reauthenticationPassword, setReauthenticationPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const [response, summaryResponse, ordersResponse, passkeysResponse] = await Promise.all([
      fetch("/api/admin/frontier", { cache: "no-store" }),
      fetch("/api/admin/content?section=summary", { cache: "no-store" }),
      fetch("/api/admin/content?section=orders", { cache: "no-store" }),
      fetch("/api/admin/passkey/credentials", { cache: "no-store" }),
    ]);
    if ([response, summaryResponse, ordersResponse, passkeysResponse].some((item) => item.status === 401)) {
      setSubmissions(null);
      setDonations([]);
      setSeasonConfiguration(null);
      setSeasonReward("");
      setContentState(null);
      setOrders([]);
      setPasskeys([]);
      return;
    }
    const body = await jsonMessage(response);
    const [summary, orderData] = await Promise.all([
      jsonMessage(summaryResponse),
      jsonMessage(ordersResponse),
    ]);
    setSubmissions(Array.isArray(body?.submissions) ? body.submissions : []);
    setDonations(Array.isArray(body?.donations) ? body.donations : []);
    setSeasonConfiguration(body?.seasonConfiguration ?? null);
    setSeasonReward(body?.seasonConfiguration?.officialReward ?? "");
    setContentState(summary?.state ?? null);
    setOrders(Array.isArray(orderData?.orders) ? orderData.orders : []);
    if (passkeysResponse.ok) {
      const passkeyData = await passkeysResponse.json() as { credentials?: AdminPasskeyCredential[] };
      setPasskeys(Array.isArray(passkeyData.credentials) ? passkeyData.credentials : []);
    } else {
      setPasskeys([]);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      void Promise.all([
        fetch("/api/admin/login", { cache: "no-store" })
          .then((response) => response.json())
          .then((body: { mode?: AdminLoginMode; enrollmentRequired?: boolean }) => {
            if (body.mode === "passkey" || body.mode === "local-password") setLoginMode(body.mode);
            setEnrollmentRequired(body.enrollmentRequired === true);
          }),
        load(),
      ]).catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取运营数据。"));
    });
    return () => { active = false; };
  }, [load]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loginMode) return;
    setPending(true);
    setError("");
    try {
      if (loginMode === "passkey") {
        if (enrollmentRequired) {
          const optionsResponse = await fetch("/api/admin/passkey/register/options", {
            method: "POST",
            headers: adminMutationHeaders,
            body: JSON.stringify({ enrollmentToken }),
          });
          const optionsBody = await optionsResponse.json() as { ceremonyId?: string; options?: Parameters<typeof startRegistration>[0]["optionsJSON"]; error?: string };
          if (!optionsResponse.ok || !optionsBody.ceremonyId || !optionsBody.options) throw new Error(optionsBody.error ?? "无法开始 Passkey 注册。");
          const credential = await startRegistration({ optionsJSON: optionsBody.options });
          const verifyResponse = await fetch("/api/admin/passkey/register/verify", {
            method: "POST",
            headers: adminMutationHeaders,
            body: JSON.stringify({ ceremonyId: optionsBody.ceremonyId, response: credential }),
          });
          const verifyBody = await verifyResponse.json() as { recoveryCodes?: string[]; error?: string };
          if (!verifyResponse.ok) throw new Error(verifyBody.error ?? "Passkey 注册失败。");
          setEnrollmentToken("");
          setEnrollmentRequired(false);
          if (verifyBody.recoveryCodes?.length) {
            setNotice(`恢复码只显示这一次，请立即离线保存：\n${verifyBody.recoveryCodes.join("\n")}`);
          }
        } else {
          const optionsResponse = await fetch("/api/admin/passkey/authenticate/options", {
            method: "POST",
            headers: adminMutationHeaders,
            body: JSON.stringify({ purpose: "login" }),
          });
          const optionsBody = await optionsResponse.json() as { ceremonyId?: string; options?: Parameters<typeof startAuthentication>[0]["optionsJSON"]; error?: string };
          if (!optionsResponse.ok || !optionsBody.ceremonyId || !optionsBody.options) throw new Error(optionsBody.error ?? "无法开始 Passkey 验证。");
          const credential = await startAuthentication({ optionsJSON: optionsBody.options });
          const verifyResponse = await fetch("/api/admin/passkey/authenticate/verify", {
            method: "POST",
            headers: adminMutationHeaders,
            body: JSON.stringify({ ceremonyId: optionsBody.ceremonyId, purpose: "login", response: credential }),
          });
          await jsonMessage(verifyResponse);
        }
        await load();
        return;
      }
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify(loginMode === "local-password" ? { password } : {}),
      });
      await jsonMessage(response);
      setPassword("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法登录后台。" );
    } finally {
      setPending(false);
    }
  }

  async function updateDonation(donationId: string, action: "confirm-donation" | "reject-donation" | "withdraw-donation") {
    const actionLabel = action === "confirm-donation" ? "确认并公开" : action === "reject-donation" ? "拒绝" : "撤回";
    if (!window.confirm(`确认${actionLabel}这条奖品记录？该操作会写入不可变审计日志。`)) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/frontier", { method: "POST", headers: adminMutationHeaders, body: JSON.stringify({ action, donationId, confirm: true }) });
      const body = await jsonMessage(response);
      setSubmissions(Array.isArray(body?.submissions) ? body.submissions : []);
      setDonations(Array.isArray(body?.donations) ? body.donations : []);
      setNotice("奖品状态已更新。");
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === "ADMIN_REAUTH_REQUIRED") {
        setReauthenticationRequired(true);
        setReauthenticationUrl(cause.reauthenticationUrl ?? "");
      }
      setError(cause instanceof Error ? cause.message : "暂时无法更新奖品状态。");
    } finally {
      setPending(false);
    }
  }

  async function updateSeasonReward(action: "save-season-reward" | "publish-season-reward") {
    const publishing = action === "publish-season-reward";
    if (!window.confirm(publishing
      ? "确认发布本赛季奖励并开放报名、验证与奖品捐献？该操作会写入不可变审计日志。"
      : "确认保存本赛季奖励草稿？保存草稿会让赛季保持或恢复为准备中。")) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/frontier", {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify({ action, officialReward: seasonReward, confirm: true }),
      });
      const body = await jsonMessage(response);
      setSeasonConfiguration(body?.seasonConfiguration ?? null);
      setSeasonReward(body?.seasonConfiguration?.officialReward ?? seasonReward);
      setNotice(publishing ? "本赛季奖励已发布，公开写入口已开放。" : "本赛季奖励草稿已保存，重新发布前公开写入口保持关闭。");
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === "ADMIN_REAUTH_REQUIRED") {
        setReauthenticationRequired(true);
        setReauthenticationUrl(cause.reauthenticationUrl ?? "");
      }
      setError(cause instanceof Error ? cause.message : "暂时无法更新赛季奖励。");
    } finally {
      setPending(false);
    }
  }

  async function recoverPasskey() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/passkey/recover", {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify({ recoveryCode }),
      });
      const body = await response.json() as { enrollmentToken?: string; error?: string };
      if (!response.ok || !body.enrollmentToken) throw new Error(body.error ?? "恢复失败。");
      setEnrollmentToken(body.enrollmentToken);
      setRecoveryCode("");
      setEnrollmentRequired(true);
      setNotice("恢复码已兑换为十分钟有效的注册令牌，请立即注册新的 Passkey。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "恢复失败。");
    } finally {
      setPending(false);
    }
  }

  async function addPasskey() {
    setPending(true);
    setError("");
    try {
      const optionsResponse = await fetch("/api/admin/passkey/register/options", {
        method: "POST",
        headers: adminMutationHeaders,
        body: "{}",
      });
      const optionsBody = await optionsResponse.json() as { ceremonyId?: string; options?: Parameters<typeof startRegistration>[0]["optionsJSON"]; error?: string; code?: string };
      if (!optionsResponse.ok || !optionsBody.ceremonyId || !optionsBody.options) {
        if (optionsBody.code === "ADMIN_REAUTH_REQUIRED") setReauthenticationRequired(true);
        throw new Error(optionsBody.error ?? "无法开始 Passkey 注册。");
      }
      const credential = await startRegistration({ optionsJSON: optionsBody.options });
      const verifyResponse = await fetch("/api/admin/passkey/register/verify", {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify({ ceremonyId: optionsBody.ceremonyId, response: credential }),
      });
      await jsonMessage(verifyResponse);
      setNotice("新的 Passkey 已注册。");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Passkey 注册失败。");
    } finally {
      setPending(false);
    }
  }

  async function revokePasskey(credentialId: string) {
    if (!window.confirm("确认撤销这个 Passkey？最后一个有效凭证不能撤销。")) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/passkey/credentials", {
        method: "DELETE",
        headers: adminMutationHeaders,
        body: JSON.stringify({ credentialId, confirm: true }),
      });
      const body = await response.json() as { error?: string; code?: string };
      if (!response.ok) {
        if (body.code === "ADMIN_REAUTH_REQUIRED") setReauthenticationRequired(true);
        throw new Error(body.error ?? "无法撤销 Passkey。");
      }
      setNotice("Passkey 已撤销。");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法撤销 Passkey。");
    } finally {
      setPending(false);
    }
  }

  async function reauthenticate() {
    setPending(true);
    setError("");
    try {
      if (loginMode === "passkey") {
        await reauthenticateAdminWithPasskey();
        setReauthenticationRequired(false);
        setNotice("高风险操作权限已重新验证，有效期五分钟。");
        return;
      }
      const response = await fetch("/api/admin/reauthenticate", {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify(loginMode === "local-password" ? { password: reauthenticationPassword } : {}),
      });
      const body = await response.json().catch(() => null) as { error?: string; reauthenticationUrl?: string } | null;
      if (!response.ok) {
        setReauthenticationUrl(body?.reauthenticationUrl ?? reauthenticationUrl);
        throw new Error(body?.error ?? "身份重新验证失败。");
      }
      setReauthenticationRequired(false);
      setReauthenticationPassword("");
      setNotice("高风险操作权限已重新验证，有效期五分钟。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "身份重新验证失败。");
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    const response = await fetch("/api/admin/logout", { method: "POST", headers: adminMutationHeaders, body: "{}" });
    const body = await response.json().catch(() => null) as { logoutUrl?: unknown } | null;
    if (typeof body?.logoutUrl === "string" && body.logoutUrl) {
      window.location.assign(body.logoutUrl);
      return;
    }
    setSubmissions(null);
    setDonations([]);
    setSeasonConfiguration(null);
    setSeasonReward("");
    setContentState(null);
    setOrders([]);
    setNotice("");
  }

  async function updateOpcOrder(order: OpcOrder, status: OpcOrderStatus) {
    if (!window.confirm(`确认将订单 ${order.reference} 更新为“${opcOrderStatusLabels[status]}”？该操作会写入不可变审计记录。`)) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const paymentCancellation = order.status === "awaiting_payment" && status === "cancelled";
      const response = await fetch(paymentCancellation
        ? `/api/admin/opc/orders/${encodeURIComponent(order.id)}/cancel`
        : "/api/admin/content", {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify(paymentCancellation ? {
          expectedUpdatedAt: order.updatedAt,
        } : {
          action: "update-opc-order",
          orderId: order.id,
          orderStatus: status,
          expectedUpdatedAt: order.updatedAt,
          confirm: true,
        }),
      });
      const body = await jsonMessage(response);
      if (paymentCancellation) await load();
      else setOrders(Array.isArray(body?.orders) ? body.orders : []);
      setNotice(`订单 ${order.reference} 已更新为“${opcOrderStatusLabels[status]}”。`);
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === "ADMIN_REAUTH_REQUIRED") {
        setReauthenticationRequired(true);
        setReauthenticationUrl(cause.reauthenticationUrl ?? "");
      }
      setError(cause instanceof Error ? cause.message : "暂时无法更新 OPC 订单。");
    } finally {
      setPending(false);
    }
  }

  function openBankVerification(order: OpcOrder) {
    setError("");
    setNotice("");
    setBankVerificationDraft({
      orderId: order.id,
      bankTransactionId: "",
      payerName: "",
      paidAt: "",
      evidenceConfirmed: false,
      errors: {},
    });
    requestAnimationFrame(() => document.getElementById(`bank-transaction-${order.id}`)?.focus());
  }

  function closeBankVerification(order: OpcOrder) {
    setBankVerificationDraft(null);
    requestAnimationFrame(() => document.getElementById(`verify-bank-${order.id}`)?.focus());
  }

  function updateBankVerification(field: Exclude<BankVerificationField, "evidenceConfirmed">, value: string) {
    setBankVerificationDraft((current) => current ? {
      ...current,
      [field]: field === "bankTransactionId" ? value.toUpperCase() : value,
      errors: { ...current.errors, [field]: undefined },
    } : current);
  }

  async function verifyOpcBankTransfer(event: FormEvent<HTMLFormElement>, order: OpcOrder) {
    event.preventDefault();
    const draft = bankVerificationDraft;
    if (!draft || draft.orderId !== order.id) return;
    const bankTransactionId = draft.bankTransactionId.trim().toUpperCase();
    const payerName = draft.payerName.trim();
    const paidAt = bankPaidAtToBeijingIso(draft.paidAt);
    const errors: BankVerificationDraft["errors"] = {};
    if (!/^[A-Z0-9][A-Z0-9._/-]{5,79}$/.test(bankTransactionId)) errors.bankTransactionId = "请填写 6–80 位银行流水号，可使用字母、数字、点、斜线、连字符或下划线。";
    if (payerName.length < 2 || payerName.length > 160) errors.payerName = "请按银行回单填写 2–160 字的付款户名。";
    if (!paidAt || new Date(paidAt).getTime() > Date.now() + 5 * 60_000) errors.paidAt = "请填写有效且不晚于当前时间五分钟的北京时间。";
    if (!draft.evidenceConfirmed) errors.evidenceConfirmed = "请确认已逐项核对企业银行实际入账记录。";
    if (Object.keys(errors).length > 0) {
      setBankVerificationDraft({ ...draft, errors });
      const first = (["bankTransactionId", "payerName", "paidAt", "evidenceConfirmed"] as const).find((field) => errors[field]);
      const focusTarget = first ? {
        bankTransactionId: `bank-transaction-${order.id}`,
        payerName: `bank-payerName-${order.id}`,
        paidAt: `bank-paidAt-${order.id}`,
        evidenceConfirmed: `bank-evidenceConfirmed-${order.id}`,
      }[first] : null;
      if (focusTarget) requestAnimationFrame(() => document.getElementById(focusTarget)?.focus());
      return;
    }
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/opc/orders/${encodeURIComponent(order.id)}/verify-bank-transfer`, {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify({
          expectedUpdatedAt: order.updatedAt,
          amountDecimal: order.payment.amount.decimal,
          bankTransactionId,
          payerName,
          paidAt,
          evidenceConfirmed: true,
        }),
      });
      await jsonMessage(response);
      await load();
      setBankVerificationDraft(null);
      setNotice(`订单 ${order.reference} 的银行到账已核验。`);
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === "ADMIN_REAUTH_REQUIRED") {
        setReauthenticationRequired(true);
        setReauthenticationUrl(cause.reauthenticationUrl ?? "");
      }
      setError(cause instanceof Error ? cause.message : "银行到账核验失败。");
    } finally {
      setPending(false);
    }
  }

  async function reconcileOpcSignature(order: OpcOrder) {
    if (!window.confirm(`确认查询订单 ${order.reference} 的实时签署状态？查询结果会写入审计记录。`)) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/content", {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify({ action: "reconcile-opc-signature", orderId: order.id, confirm: true }),
      });
      const body = await jsonMessage(response);
      setOrders(Array.isArray(body?.orders) ? body.orders : []);
      setNotice(`订单 ${order.reference} 已完成签署状态查询。`);
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === "ADMIN_REAUTH_REQUIRED") {
        setReauthenticationRequired(true);
        setReauthenticationUrl(cause.reauthenticationUrl ?? "");
      }
      setError(cause instanceof Error ? cause.message : "暂时无法查询订单签署状态。");
    } finally {
      setPending(false);
    }
  }

  async function downloadOpcOrderArtifact(order: OpcOrder, kind: "contract" | "contact") {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/opc/orders/${encodeURIComponent(order.id)}/${kind}`, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string; code?: string; reauthenticationUrl?: string } | null;
        throw new AdminApiError(body?.error ?? "下载失败。", body?.code, body?.reauthenticationUrl);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${order.reference}-${kind === "contract" ? "signed-contract.pdf" : "customer-contact.csv"}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(kind === "contract" ? `订单 ${order.reference} 的已签合同已下载。` : `订单 ${order.reference} 的客户联系方式已导出。`);
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === "ADMIN_REAUTH_REQUIRED") {
        setReauthenticationRequired(true);
        setReauthenticationUrl(cause.reauthenticationUrl ?? "");
      }
      setError(cause instanceof Error ? cause.message : "下载失败。");
    } finally {
      setPending(false);
    }
  }

  async function viewOpcDossier(order: OpcOrder) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/opc/orders/${encodeURIComponent(order.id)}/dossier`, { cache: "no-store" });
      const body = await jsonMessage(response);
      if (!body?.dossier) throw new Error("订单 dossier 不可用。");
      setOpcDossiers((current) => ({ ...current, [order.id]: body.dossier! }));
      setNotice(`订单 ${order.reference} 的完整资料已载入，本次查看已写入审计日志。`);
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === "ADMIN_REAUTH_REQUIRED") {
        setReauthenticationRequired(true);
        setReauthenticationUrl(cause.reauthenticationUrl ?? "");
      }
      setError(cause instanceof Error ? cause.message : "无法读取订单 dossier。");
    } finally {
      setPending(false);
    }
  }

  async function runOpcPaperAction(order: OpcOrder, action: "approve-contract" | "refund") {
    const reason = action === "refund"
      ? window.prompt("请输入原路全额退款原因：", "用户不同意纸质合同")
      : "";
    if (action === "refund" && reason === null) return;
    const confirmation = action === "approve-contract"
      ? `确认已经收到并核验订单 ${order.reference} 的已签字纸质合同？`
      : `该历史在线付款渠道已经退役，不能执行原渠道退款。`;
    if (!window.confirm(confirmation)) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/opc/orders/${encodeURIComponent(order.id)}/${action}`, {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify(action === "refund"
          ? { reason, expectedUpdatedAt: order.updatedAt }
          : { expectedUpdatedAt: order.updatedAt }),
      });
      const body = await jsonMessage(response);
      await load();
      setNotice(action === "approve-contract"
        ? `订单 ${order.reference} 已确认收到纸质合同。`
        : body?.order?.status === "refunded"
          ? `订单 ${order.reference} 的退款已确认。`
          : `该历史在线付款渠道已经退役。`);
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === "ADMIN_REAUTH_REQUIRED") {
        setReauthenticationRequired(true);
        setReauthenticationUrl(cause.reauthenticationUrl ?? "");
      }
      setError(cause instanceof Error ? cause.message : "纸质订单操作失败。");
    } finally {
      setPending(false);
    }
  }

  if (submissions === null) {
    return (
      <form className="admin-login" onSubmit={login}>
        <p className="eyebrow mono">SECURE OPERATOR ACCESS</p>
        <h2>进入运营后台。</h2>
        <div className="form-field">
          {loginMode === null
            ? <><strong>正在确认安全入口</strong><p className="form-note">正在读取当前环境的管理员认证方式。</p></>
            : loginMode === "passkey"
            ? <><strong>原生 Passkey 安全身份入口</strong><p className="form-note">凭证仅绑定本站管理域名，并要求设备完成用户验证。</p>{enrollmentRequired ? <><label htmlFor="admin-enrollment-token">一次性注册令牌</label><input id="admin-enrollment-token" value={enrollmentToken} onChange={(event) => setEnrollmentToken(event.target.value)} autoComplete="off" required /></> : null}</>
            : <><label htmlFor="admin-password">本地开发密码</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} required /></>}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="text-action" type="submit" disabled={pending || loginMode === null || (loginMode === "passkey" && enrollmentRequired && !enrollmentToken)}>{pending ? "正在验证" : loginMode === null ? "正在载入" : loginMode === "passkey" ? enrollmentRequired ? "注册 Passkey" : "使用 Passkey 登录" : "进入本地后台"}</button>
        <p className="form-note mono">{loginMode === null ? "SECURE MODE DISCOVERY" : loginMode === "passkey" ? "WEBAUTHN / USER VERIFICATION / REVOCABLE SESSION" : "LOCAL DEVELOPMENT ADAPTER ONLY"}</p>
        {loginMode === "passkey" && !enrollmentRequired ? <div className="form-field"><label htmlFor="admin-recovery-code">丢失 Passkey？使用一次性恢复码</label><input id="admin-recovery-code" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} autoComplete="off" /><button className="text-link" type="button" disabled={pending || !recoveryCode} onClick={() => void recoverPasskey()}>开始恢复</button></div> : null}
      </form>
    );
  }

  return (
    <section className="admin-console">
      <nav className="admin-console__navigation" aria-label="后台功能">
        <a href="#admin-overview"><span className="mono">READ ONLY</span><strong>运行概览</strong><small>自动资讯与榜单状态</small></a>
        <a href="/sources"><span className="mono">GOVERNANCE</span><strong>来源组合</strong><small>查看受控来源目录</small></a>
        <a href="#admin-opc"><span className="mono">EDITABLE</span><strong>OPC 菜单</strong><small>人工服务目录</small></a>
        <a href="#admin-opc-orders"><span className="mono">PAYMENT</span><strong>OPC 订单</strong><small>联系与到账核验</small></a>
        <a href="#admin-frontier"><span className="mono">BUSINESS</span><strong>边境计划</strong><small>报名与奖品异常</small></a>
        <a href="/pipeline"><span className="mono">DIAGNOSTIC</span><strong>系统记录</strong><small>受保护管线诊断</small></a>
      </nav>
      <div className="admin-console__top" id="admin-frontier">
        <div><p className="eyebrow mono">FRONTIER / BUSINESS OPERATIONS</p><h2>报名与奖品业务</h2><p className="form-note">排名和 Star 观察仅由定时任务与异步兜底生成；后台不能人工触发、编辑或覆盖排名事实。</p></div>
        <div className="admin-actions"><button className="text-link" type="button" onClick={logout}>退出后台</button></div>
      </div>
      {reauthenticationRequired ? (
        <section className="admin-reauth-panel" id="admin-reauth" aria-labelledby="admin-reauth-title">
          <div>
            <p className="eyebrow mono">STEP-UP AUTHENTICATION</p>
            <h3 id="admin-reauth-title">重新验证高风险操作权限</h3>
            <p>{loginMode === "passkey" ? "再次使用已注册 Passkey 完成设备用户验证。" : "输入本地开发密码；生产环境不会显示此密码框。"}</p>
          </div>
          {loginMode === "passkey" ? (
            <div className="admin-actions">
              <button className="text-action" type="button" disabled={pending} onClick={() => void reauthenticate()}>使用 Passkey 重新验证</button>
            </div>
          ) : (
            <div className="admin-actions">
              <div className="form-field">
                <label htmlFor="admin-reauth-password">本地开发密码</label>
                <input id="admin-reauth-password" type="password" autoComplete="current-password" value={reauthenticationPassword} onChange={(event) => setReauthenticationPassword(event.target.value)} />
              </div>
              <button className="text-action" type="button" disabled={pending || !reauthenticationPassword} onClick={() => void reauthenticate()}>验证权限</button>
            </div>
          )}
        </section>
      ) : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="admin-notice" role="status">{notice}</p> : null}
      {loginMode === "passkey" ? (
        <section className="admin-donations" aria-labelledby="admin-passkeys-title">
          <div className="admin-section-heading">
            <p className="eyebrow mono">SECURITY / PASSKEYS</p>
            <h2 id="admin-passkeys-title">管理员凭证</h2>
            <p className="form-note">添加或撤销凭证前必须在五分钟内重新验证；系统拒绝撤销最后一个有效 Passkey。</p>
          </div>
          <div className="admin-donation-list">
            {passkeys.map((credential, index) => (
              <article className="admin-donation" key={credential.credentialId}>
                <div><strong>Passkey {index + 1}</strong><p className="form-note mono">{credential.credentialId.slice(0, 16)}… · {credential.backedUp ? "已备份" : "单设备"} · {credential.lastUsedAt ? `最近使用 ${new Date(credential.lastUsedAt).toLocaleDateString("zh-CN")}` : `注册 ${new Date(credential.createdAt).toLocaleDateString("zh-CN")}`}</p></div>
                <div className="admin-actions"><button className="text-link" type="button" disabled={pending || passkeys.length <= 1} onClick={() => void revokePasskey(credential.credentialId)}>撤销</button></div>
              </article>
            ))}
          </div>
          <div className="admin-actions"><button className="text-action" type="button" disabled={pending} onClick={() => void addPasskey()}>添加 Passkey</button></div>
        </section>
      ) : null}
      <section className="admin-donations" aria-labelledby="admin-season-reward-title">
        <div className="admin-section-heading">
          <p className="eyebrow mono">FRONTIER / SEASON CONTROL</p>
          <h2 id="admin-season-reward-title">本赛季官方奖励</h2>
          <p className="form-note">每个赛季先保存草稿，再经五分钟内重新认证后发布。未发布时赛季显示准备中，报名、验证和捐献接口全部关闭。</p>
        </div>
        <div className="form-field">
          <label htmlFor="frontier-season-reward">奖励公开文案</label>
          <input id="frontier-season-reward" value={seasonReward} onChange={(event) => setSeasonReward(event.target.value)} minLength={4} maxLength={200} disabled={pending} placeholder="例如：冠军奖金人民币 10,000 元" />
        </div>
        <p className="form-note">
          {seasonConfiguration?.season ?? "当前赛季"} · {seasonConfiguration?.status === "published" ? "已发布" : "草稿"} · 对外组织：边境计划管理局 · 获奖者承担依法归属于其本人的税费 · 赛季结束后 7 日内开放奖励确认与发放流程
        </p>
        <div className="admin-actions">
          <button className="text-link" type="button" disabled={pending || seasonReward.trim().length < 4} onClick={() => void updateSeasonReward("save-season-reward")}>保存草稿</button>
          <button className="text-action" type="button" disabled={pending || seasonConfiguration?.status !== "draft" || !seasonConfiguration.officialReward} onClick={() => void updateSeasonReward("publish-season-reward")}>发布并开放本赛季</button>
        </div>
      </section>
      <div className="admin-table" role="region" aria-label="边境计划报名记录" tabIndex={0}>
        <div className="admin-table__head mono"><span>状态</span><span>仓库 / 项目</span><span>联系邮箱</span><span>Star</span><span>时间</span></div>
        {submissions.length === 0 ? <p className="ranking-empty">当前没有报名记录。</p> : submissions.map((submission) => (
          <div className="admin-table__row" key={submission.id}>
            <span className={`admin-status admin-status--${submission.status}`}>{submission.status}</span>
            <div><strong>{submission.repository}</strong><p>{submission.note}</p></div>
            <span className="mono">{submission.email}</span>
            <span className="mono">{submission.baselineStars ?? "—"} / {submission.currentStars ?? "—"}</span>
            <span className="mono">{submission.verifiedAt ? `验证 ${new Date(submission.verifiedAt).toLocaleDateString("zh-CN")}` : `创建 ${new Date(submission.createdAt).toLocaleDateString("zh-CN")}`}</span>
          </div>
        ))}
      </div>
      <section className="admin-donations" aria-labelledby="admin-donations-title">
        <div className="admin-section-heading"><p className="eyebrow mono">FRONTIER / PRIZE DONATIONS</p><h2 id="admin-donations-title">奖品捐献确认</h2></div>
        <div className="admin-donation-list">
          {donations.length === 0 ? <p className="ranking-empty">当前没有奖品捐献记录。</p> : donations.map((donation) => (
            <article key={donation.id}>
              <div><p className="mono muted">{donation.season} / {donation.status}</p><h3>{donation.name}</h3><p>{donation.description}</p></div>
              <div className="admin-donation-meta"><span className="mono">{donation.email}</span><time className="mono">{new Date(donation.createdAt).toLocaleString("zh-CN", { hour12: false })}</time></div>
              <div className="admin-actions">
                {donation.status === "pending_confirmation" ? <><button className="text-action" type="button" disabled={pending} onClick={() => updateDonation(donation.id, "confirm-donation")}>确认并公开</button><button className="text-link" type="button" disabled={pending} onClick={() => updateDonation(donation.id, "reject-donation")}>拒绝</button></> : null}
                {donation.status === "available" || donation.status === "carried_over" ? <button className="text-link" type="button" disabled={pending} onClick={() => updateDonation(donation.id, "withdraw-donation")}>撤回奖品</button> : null}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="admin-pipeline" id="admin-overview" aria-label="信息管道状态">
        <p className="eyebrow mono">CONTENT PIPELINE / DOMESTIC VIEW</p>
        <h2>信息管道状态</h2>
        {contentState ? (
          <div className="admin-pipeline__metrics mono">
            <span>MODE <strong>{contentState.mode.toUpperCase()}</strong></span>
            <span>SOURCES <strong>{contentState.sourceCount}</strong></span>
            <span>EVENTS <strong>{contentState.eventCount}</strong></span>
            <span>PROJECTS <strong>{contentState.projectCount}</strong></span>
            <span>LAST RUN <strong>{contentState.updatedAt ? new Date(contentState.updatedAt).toLocaleString("zh-CN", { hour12: false }) : "—"}</strong></span>
          </div>
        ) : <p className="ranking-empty">暂时无法读取信息管道状态。</p>}
      </section>
      <AdminOpcCatalogEditor />
      <section className="admin-donations admin-opc-orders" id="admin-opc-orders" aria-labelledby="admin-opc-orders-title">
        <div className="admin-section-heading">
          <p className="eyebrow mono">OPC / ORDER OPERATIONS</p>
          <h2 id="admin-opc-orders-title">订单与到账核验</h2>
          <p className="form-note">旧在线支付已经退役；线下订单以企业银行实际入账记录为准。管理员重新验证身份后，按固定金额、付款户名、流水号和入账时间确认到账。</p>
        </div>
        <div className="admin-donation-list">
          {orders.length === 0 ? <p className="ranking-empty">当前没有 OPC 订单。</p> : orders.map((order) => (
            <article key={order.id} id={`opc-order-${order.reference}`}>
              <div>
                <p className="mono muted">{order.reference} / {opcOrderStatusLabels[order.status]}</p>
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
                <span className="mono">签署状态 {opcSignatureStatusLabels[order.signature.status] ?? order.signature.status}</span>
                <span className="mono">签署流程 {order.signature.flowId ?? "—"}</span>
                <span className="mono">合同文件 {order.signature.fileId ?? "—"}</span>
                <span className="mono">模板 {order.signature.templateId ?? "—"} / {order.signature.templateVersion ?? "—"}</span>
                {order.signature.notifiedAt ? <time className="mono">签署通知 {new Date(order.signature.notifiedAt).toLocaleString("zh-CN", { hour12: false })}</time> : null}
                {order.signature.checkedAt ? <time className="mono">签署查询 {new Date(order.signature.checkedAt).toLocaleString("zh-CN", { hour12: false })}</time> : null}
                {order.signature.completedAt ? <time className="mono">签署完成 {new Date(order.signature.completedAt).toLocaleString("zh-CN", { hour12: false })}</time> : null}
                {order.signature.failureReason ? <span>签署异常 {opcSignatureFailureLabels[order.signature.failureReason] ?? "未提供详细原因"}</span> : null}
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
              {opcDossiers[order.id] ? <OpcDossierView dossier={opcDossiers[order.id]} /> : null}
              <div className="admin-actions">
                {order.contactAvailable ? <button className="text-action" type="button" disabled={pending} onClick={() => void viewOpcDossier(order)}>查看完整订单 dossier</button> : null}
                {order.signature.archive.status === "archived" && order.signature.archive.sha256 ? <button className="text-action" type="button" disabled={pending} onClick={() => void downloadOpcOrderArtifact(order, "contract")}>下载已签合同</button> : null}
                {order.contactAvailable ? <button className="text-link" type="button" disabled={pending} onClick={() => void downloadOpcOrderArtifact(order, "contact")}>导出客户联系方式</button> : null}
                {order.status === "awaiting_signature" ? <>
                  <button className="text-action" type="button" disabled={pending} onClick={() => void reconcileOpcSignature(order)}>查询签署状态</button>
                  <button className="text-link" type="button" disabled={pending} onClick={() => void updateOpcOrder(order, "cancelled")}>取消订单</button>
                </> : null}
                {order.status === "awaiting_payment" ? (
                  <>
                    {order.payment.provider === "bank_transfer" ? <>
                      <button id={`verify-bank-${order.id}`} className="text-action" type="button" disabled={pending} aria-expanded={bankVerificationDraft?.orderId === order.id} aria-controls={`bank-verification-${order.id}`} onClick={() => openBankVerification(order)}>确认银行到账</button>
                      <button className="text-link" type="button" disabled={pending} onClick={() => void updateOpcOrder(order, "cancelled")}>取消未付款订单</button>
                    </> : <>
                      <button className="text-link" type="button" disabled={pending} onClick={() => void updateOpcOrder(order, "cancelled")}>取消订单</button>
                    </>}
                  </>
                ) : null}
                {order.status === "paid" ? (
                  <>
                    <button className="text-action" type="button" disabled={pending} onClick={() => void updateOpcOrder(order, "completed")}>标记交付完成</button>
                  </>
                ) : null}
                {order.status === "paid_pending_contract" ? <>
                  <button className="text-action" type="button" disabled={pending} onClick={() => void runOpcPaperAction(order, "approve-contract")}>确认收到已签纸质合同</button>
                </> : null}
              </div>
              {bankVerificationDraft?.orderId === order.id ? (
                <form id={`bank-verification-${order.id}`} className="admin-bank-verification" onSubmit={(event) => void verifyOpcBankTransfer(event, order)} noValidate>
                  <header>
                    <p className="eyebrow mono">BANK EVIDENCE / 到账证据</p>
                    <h4>核对企业银行实际入账记录</h4>
                    <p>仅在银行端已经看到真实入账后提交。系统会锁定订单版本、固定金额、付款户名、流水号和北京时间，并留下不可变审计记录。</p>
                  </header>
                  <dl className="admin-bank-verification__summary" aria-label="本次到账核验摘要">
                    <div><dt>订单号</dt><dd>{order.reference}</dd></div>
                    <div><dt>固定金额</dt><dd>人民币 {order.payment.amount.decimal} 元</dd></div>
                    <div><dt>收款户名</dt><dd>{order.payment.accountName ?? "订单缺少账户快照"}</dd></div>
                    <div><dt>收款银行</dt><dd>{order.payment.bankName ?? "订单缺少银行快照"}</dd></div>
                  </dl>
                  <div className="admin-bank-verification__fields">
                    <div className="form-field">
                      <label htmlFor={`bank-transaction-${order.id}`}>银行流水号</label>
                      <input id={`bank-transaction-${order.id}`} value={bankVerificationDraft.bankTransactionId} onChange={(event) => updateBankVerification("bankTransactionId", event.target.value)} maxLength={80} autoComplete="off" aria-invalid={Boolean(bankVerificationDraft.errors.bankTransactionId)} aria-describedby={bankVerificationDraft.errors.bankTransactionId ? `bank-transaction-error-${order.id}` : `bank-transaction-hint-${order.id}`} />
                      <p id={`bank-transaction-hint-${order.id}`}>系统会统一为大写并拒绝已绑定其他订单的流水号。</p>
                      {bankVerificationDraft.errors.bankTransactionId ? <p id={`bank-transaction-error-${order.id}`} className="form-error">{bankVerificationDraft.errors.bankTransactionId}</p> : null}
                    </div>
                    <div className="form-field">
                      <label htmlFor={`bank-payerName-${order.id}`}>付款户名</label>
                      <input id={`bank-payerName-${order.id}`} value={bankVerificationDraft.payerName} onChange={(event) => updateBankVerification("payerName", event.target.value)} maxLength={160} autoComplete="off" aria-invalid={Boolean(bankVerificationDraft.errors.payerName)} aria-describedby={bankVerificationDraft.errors.payerName ? `bank-payer-error-${order.id}` : undefined} />
                      {bankVerificationDraft.errors.payerName ? <p id={`bank-payer-error-${order.id}`} className="form-error">{bankVerificationDraft.errors.payerName}</p> : null}
                    </div>
                    <div className="form-field">
                      <label htmlFor={`bank-paidAt-${order.id}`}>银行入账时间（北京时间）</label>
                      <input id={`bank-paidAt-${order.id}`} type="datetime-local" step="1" value={bankVerificationDraft.paidAt} onChange={(event) => updateBankVerification("paidAt", event.target.value)} aria-invalid={Boolean(bankVerificationDraft.errors.paidAt)} aria-describedby={bankVerificationDraft.errors.paidAt ? `bank-paidAt-error-${order.id}` : `bank-paidAt-hint-${order.id}`} />
                      <p id={`bank-paidAt-hint-${order.id}`}>按银行回单填写，系统固定按 UTC+08:00 解释。</p>
                      {bankVerificationDraft.errors.paidAt ? <p id={`bank-paidAt-error-${order.id}`} className="form-error">{bankVerificationDraft.errors.paidAt}</p> : null}
                    </div>
                  </div>
                  <div className="admin-bank-verification__confirmation">
                    <input id={`bank-evidenceConfirmed-${order.id}`} type="checkbox" checked={bankVerificationDraft.evidenceConfirmed} onChange={(event) => setBankVerificationDraft((current) => current ? { ...current, evidenceConfirmed: event.target.checked, errors: { ...current.errors, evidenceConfirmed: undefined } } : current)} aria-invalid={Boolean(bankVerificationDraft.errors.evidenceConfirmed)} aria-describedby={bankVerificationDraft.errors.evidenceConfirmed ? `bank-confirm-error-${order.id}` : undefined} />
                    <label htmlFor={`bank-evidenceConfirmed-${order.id}`}>我已逐项核对企业银行实际入账记录，确认金额、付款户名、流水号和入账时间均与本订单一致。</label>
                    {bankVerificationDraft.errors.evidenceConfirmed ? <p id={`bank-confirm-error-${order.id}`} className="form-error">{bankVerificationDraft.errors.evidenceConfirmed}</p> : null}
                  </div>
                  <footer>
                    <button className="text-action" type="submit" disabled={pending}>{pending ? "正在确认到账…" : "提交到账核验"}</button>
                    <button className="text-link" type="button" disabled={pending} onClick={() => closeBankVerification(order)}>取消并保留订单状态</button>
                  </footer>
                </form>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function OpcDossierView({ dossier }: { dossier: OpcOrderDossier }) {
  async function downloadOpcPaymentReceiptData() {
    if (!dossier.paymentReceipt) return;
    await downloadOpcPaymentReceiptPng(dossier.paymentReceipt);
  }
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
    {dossier.paymentReceipt ? <button className="text-link" type="button" onClick={() => void downloadOpcPaymentReceiptData()}>下载付款凭证截图（PNG）</button> : null}
    {dossier.checkoutAgreement ? <details>
      <summary>在线协议完整正文：{dossier.checkoutAgreement.title}</summary>
      <pre className="admin-opc-dossier__agreement">{dossier.checkoutAgreement.text}</pre>
    </details> : null}
    <details>
      <summary>审计记录（{dossier.auditTrail.length}）</summary>
      <ol>{dossier.auditTrail.map((event) => <li key={`${event.occurredAt}-${event.action}`}>
        <span className="mono">{event.occurredAt}</span> · {event.action} · {event.result}{event.reason ? ` · ${event.reason}` : ""}
      </li>)}</ol>
    </details>
  </section>;
}
