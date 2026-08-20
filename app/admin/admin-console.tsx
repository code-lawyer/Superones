"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { AdminOpcCatalogEditor } from "@/components/admin-opc-catalog-editor";
import { AdminFrontierPanel, AdminPipelineSummary } from "@/components/admin-frontier-panel";
import { AdminOpcOrdersPanel } from "@/components/admin-opc-orders-panel";
import { reauthenticateAdminWithPasskey } from "@/lib/admin-passkey-browser";
import type {
  AdminContentState,
  AdminFrontierDonation,
  AdminFrontierSeasonConfiguration,
  AdminFrontierSubmission,
  AdminBankVerificationDraft,
  AdminBankVerificationField,
  AdminLoginMode as AdminAuthenticationMode,
  AdminOpcOrder,
  AdminOpcOrderDossier,
  AdminOpcOrderStatus,
  AdminPasskeyCredential as AdminCredential,
} from "@/lib/admin-contract";
import { ADMIN_OPC_ORDER_STATUS_LABELS } from "@/lib/admin-contract";
import { AdminApiError, adminMutationHeaders, readAdminJson as jsonMessage, requestAdminJson } from "@/lib/admin-transport";

type Submission = AdminFrontierSubmission;
type Donation = AdminFrontierDonation;
type FrontierSeasonConfiguration = AdminFrontierSeasonConfiguration;
type ContentState = AdminContentState;

type OpcOrderStatus = AdminOpcOrderStatus;
type OpcOrder = AdminOpcOrder;
type OpcOrderDossier = AdminOpcOrderDossier;
type BankVerificationField = AdminBankVerificationField;
type BankVerificationDraft = AdminBankVerificationDraft;
type AdminLoginMode = AdminAuthenticationMode;
type AdminPasskeyCredential = AdminCredential;

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
      void fetch("/api/admin/login", { cache: "no-store" })
        .then((response) => response.json())
        .then(async (body: { mode?: AdminLoginMode; enrollmentRequired?: boolean; authenticated?: boolean }) => {
          if (!active) return;
          if (body.mode === "passkey" || body.mode === "local-password") setLoginMode(body.mode);
          setEnrollmentRequired(body.enrollmentRequired === true);
          if (body.authenticated === true) await load();
        })
        .catch((cause) => {
          if (active) setError(cause instanceof Error ? cause.message : "无法读取运营数据。");
        });
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
      const body = await requestAdminJson("/api/admin/frontier", {
        method: "POST",
        body: JSON.stringify({ action, donationId, confirm: true }),
      });
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
      const body = await requestAdminJson("/api/admin/frontier", {
        method: "POST",
        body: JSON.stringify({ action, officialReward: seasonReward, confirm: true }),
      });
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
    if (!window.confirm(`确认将订单 ${order.reference} 更新为“${ADMIN_OPC_ORDER_STATUS_LABELS[status]}”？该操作会写入不可变审计记录。`)) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const paymentCancellation = order.status === "awaiting_payment" && status === "cancelled";
      const body = await requestAdminJson(paymentCancellation
        ? `/api/admin/opc/orders/${encodeURIComponent(order.id)}/cancel`
        : "/api/admin/content", {
        method: "POST",
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
      if (paymentCancellation) await load();
      else setOrders(Array.isArray(body?.orders) ? body.orders : []);
      setNotice(`订单 ${order.reference} 已更新为“${ADMIN_OPC_ORDER_STATUS_LABELS[status]}”。`);
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
        throw new AdminApiError(response.status, body?.error ?? "下载失败。", body?.code, body?.reauthenticationUrl);
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
      <form className="admin-login" onSubmit={login} aria-busy={loginMode === null}>
        <p className="eyebrow mono">SECURE OPERATOR ACCESS</p>
        <h2>进入运营后台。</h2>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {loginMode === null
            ? "正在读取当前环境的管理员认证方式。"
            : loginMode === "passkey"
              ? "Passkey 安全身份入口已就绪。"
              : "本地开发密码入口已就绪。"}
        </p>
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
      <AdminFrontierPanel
        submissions={submissions}
        donations={donations}
        seasonConfiguration={seasonConfiguration}
        seasonReward={seasonReward}
        pending={pending}
        onSeasonRewardChange={setSeasonReward}
        onSeasonAction={(action) => void updateSeasonReward(action)}
        onDonationAction={(donationId, action) => void updateDonation(donationId, action)}
      />
      <AdminPipelineSummary state={contentState} />
      <AdminOpcCatalogEditor />
      <AdminOpcOrdersPanel
        orders={orders}
        dossiers={opcDossiers}
        bankDraft={bankVerificationDraft}
        pending={pending}
        onViewDossier={(order) => void viewOpcDossier(order)}
        onDownloadArtifact={(order, kind) => void downloadOpcOrderArtifact(order, kind)}
        onReconcileSignature={(order) => void reconcileOpcSignature(order)}
        onUpdateStatus={(order, status) => void updateOpcOrder(order, status)}
        onOpenBankVerification={openBankVerification}
        onCloseBankVerification={closeBankVerification}
        onUpdateBankVerification={updateBankVerification}
        onSetBankEvidenceConfirmed={(evidenceConfirmed) => setBankVerificationDraft((current) => current ? { ...current, evidenceConfirmed, errors: { ...current.errors, evidenceConfirmed: undefined } } : current)}
        onVerifyBankTransfer={(event, order) => void verifyOpcBankTransfer(event, order)}
        onPaperAction={(order, action) => void runOpcPaperAction(order, action)}
      />
    </section>
  );
}
