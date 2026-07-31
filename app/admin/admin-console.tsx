"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AdminOpcCatalogEditor } from "@/components/admin-opc-catalog-editor";

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
  status: "pending_confirmation" | "available" | "rejected" | "withdrawn" | "assigned";
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

type OpcOrderStatus = "awaiting_payment" | "paid" | "completed" | "cancelled" | "refunded";

type OpcOrder = {
  id: string;
  reference: string;
  serviceCode: string;
  serviceName: string;
  serviceRevision: string;
  quotedPrice: string;
  payment: {
    provider: "alipay";
    amount: {
      currency: "CNY";
      minorUnits: number;
      decimal: string;
    };
    sellerId: string | null;
    tradeNo: string | null;
    tradeStatus: string | null;
    channel: "page" | "wap" | null;
    requestCreatedAt: string | null;
    notifiedAt: string | null;
    checkedAt: string | null;
  };
  contact: {
    name: string;
    phone: string;
    email: string;
    wechat: string;
    note: string;
  } | null;
  status: OpcOrderStatus;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  completedAt: string | null;
  contactDeletedAt: string | null;
};

type AdminLoginMode = "oidc" | "local-password";

const opcOrderStatusLabels: Record<OpcOrderStatus, string> = {
  awaiting_payment: "待付款",
  paid: "已到账",
  completed: "已完成",
  cancelled: "已取消",
  refunded: "已退款",
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
  const body = await response.json().catch(() => null) as { error?: unknown; code?: unknown; reauthenticationUrl?: unknown; submissions?: Submission[]; donations?: Donation[]; seasonConfiguration?: FrontierSeasonConfiguration; state?: ContentState; orders?: OpcOrder[]; refreshed?: unknown; failed?: unknown } | null;
  if (!response.ok) {
    throw new AdminApiError(
      typeof body?.error === "string" ? body.error : "请求暂时无法完成。",
      typeof body?.code === "string" ? body.code : undefined,
      typeof body?.reauthenticationUrl === "string" ? body.reauthenticationUrl : undefined,
    );
  }
  return body;
}

export function AdminConsole() {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [seasonConfiguration, setSeasonConfiguration] = useState<FrontierSeasonConfiguration | null>(null);
  const [seasonReward, setSeasonReward] = useState("");
  const [contentState, setContentState] = useState<ContentState | null>(null);
  const [orders, setOrders] = useState<OpcOrder[]>([]);
  const [password, setPassword] = useState("");
  const [loginMode, setLoginMode] = useState<AdminLoginMode | null>(null);
  const [reauthenticationRequired, setReauthenticationRequired] = useState(false);
  const [reauthenticationUrl, setReauthenticationUrl] = useState("");
  const [reauthenticationPassword, setReauthenticationPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const [response, summaryResponse, ordersResponse] = await Promise.all([
      fetch("/api/admin/frontier", { cache: "no-store" }),
      fetch("/api/admin/content?section=summary", { cache: "no-store" }),
      fetch("/api/admin/content?section=orders", { cache: "no-store" }),
    ]);
    if ([response, summaryResponse, ordersResponse].some((item) => item.status === 401)) {
      setSubmissions(null);
      setDonations([]);
      setSeasonConfiguration(null);
      setSeasonReward("");
      setContentState(null);
      setOrders([]);
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
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const oidcOutcome = new URLSearchParams(window.location.search).get("oidc");
      if (oidcOutcome === "failed") setError("阿里云 IDaaS 身份验证失败，请重新尝试。");
      if (oidcOutcome === "reauthenticated") {
        setNotice("高风险操作权限已重新验证，有效期五分钟。");
      }
      if (oidcOutcome) window.history.replaceState({}, "", window.location.pathname);
      void Promise.all([
        fetch("/api/admin/login", { cache: "no-store" })
          .then((response) => response.json())
          .then((body: { mode?: AdminLoginMode }) => {
            if (body.mode === "oidc" || body.mode === "local-password") setLoginMode(body.mode);
          }),
        load(),
      ]).catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取运营数据。"));
    });
    return () => { active = false; };
  }, [load]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loginMode) return;
    if (loginMode === "oidc") {
      window.location.assign("/api/admin/oidc/start?intent=login");
      return;
    }
    setPending(true);
    setError("");
    try {
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

  async function refreshStars() {
    if (!window.confirm("确认立即读取所有已验证参赛仓库并写入新的 Star 快照？")) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/frontier", { method: "POST", headers: adminMutationHeaders, body: JSON.stringify({ action: "refresh-stars", confirm: true }) });
      const body = await jsonMessage(response);
      setSubmissions(Array.isArray(body?.submissions) ? body.submissions : []);
      setDonations(Array.isArray(body?.donations) ? body.donations : []);
      setNotice(`已刷新 ${body?.refreshed ?? 0} 个仓库${body?.failed ? `，${body.failed} 个仓库暂时无法读取` : ""}。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法刷新 Star。" );
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

  async function reauthenticate() {
    setPending(true);
    setError("");
    try {
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
      const response = await fetch("/api/admin/content", {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify({
          action: "update-opc-order",
          orderId: order.id,
          orderStatus: status,
          confirm: true,
        }),
      });
      const body = await jsonMessage(response);
      setOrders(Array.isArray(body?.orders) ? body.orders : []);
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

  async function reconcileOpcOrder(order: OpcOrder) {
    if (!window.confirm(`确认查询订单 ${order.reference} 的实时付款状态？查询结果会写入审计记录。`)) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/content", {
        method: "POST",
        headers: adminMutationHeaders,
        body: JSON.stringify({
          action: "reconcile-opc-order",
          orderId: order.id,
          confirm: true,
        }),
      });
      const body = await jsonMessage(response);
      setOrders(Array.isArray(body?.orders) ? body.orders : []);
      setNotice(`订单 ${order.reference} 已完成付款状态查询。`);
    } catch (cause) {
      if (cause instanceof AdminApiError && cause.code === "ADMIN_REAUTH_REQUIRED") {
        setReauthenticationRequired(true);
        setReauthenticationUrl(cause.reauthenticationUrl ?? "");
      }
      setError(cause instanceof Error ? cause.message : "暂时无法查询订单付款状态。");
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
            : loginMode === "oidc"
            ? <><strong>阿里云 IDaaS 安全身份入口</strong><p className="form-note">仅允许已确认的管理员邮箱，经 IDaaS MFA 后建立可撤销后台会话。</p></>
            : <><label htmlFor="admin-password">本地开发密码</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} required /></>}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="text-action" type="submit" disabled={pending || loginMode === null}>{pending ? "正在验证" : loginMode === null ? "正在载入" : loginMode === "oidc" ? "通过 IDaaS 登录" : "进入本地后台"}</button>
        <p className="form-note mono">{loginMode === null ? "SECURE MODE DISCOVERY" : loginMode === "oidc" ? "ALIYUN IDAAS OIDC / REVOCABLE SESSION" : "LOCAL DEVELOPMENT ADAPTER ONLY"}</p>
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
        <div><p className="eyebrow mono">FRONTIER / BUSINESS OPERATIONS</p><h2>报名与奖品业务</h2><p className="form-note">排名和 Star 观察由系统自动完成；手动刷新只用于故障恢复，不能编辑基线、分数或名次。</p></div>
        <div className="admin-actions"><button className="text-action" type="button" disabled={pending} onClick={refreshStars}>{pending ? "正在刷新" : "刷新 Star"}</button><button className="text-link" type="button" onClick={logout}>退出后台</button></div>
      </div>
      {reauthenticationRequired ? (
        <section className="admin-reauth-panel" aria-labelledby="admin-reauth-title">
          <div>
            <p className="eyebrow mono">STEP-UP AUTHENTICATION</p>
            <h3 id="admin-reauth-title">重新验证高风险操作权限</h3>
            <p>{loginMode === "oidc" ? "通过阿里云 IDaaS 再次完成 MFA，返回后权限自动刷新。" : "输入本地开发密码；生产环境不会显示此密码框。"}</p>
          </div>
          {loginMode === "oidc" ? (
            <div className="admin-actions">
              {reauthenticationUrl ? <a className="text-action" href={reauthenticationUrl}>通过 IDaaS 重新验证 ↗</a> : null}
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
                {donation.status === "available" ? <button className="text-link" type="button" disabled={pending} onClick={() => updateDonation(donation.id, "withdraw-donation")}>撤回奖品</button> : null}
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
          <p className="form-note">用户提交联系方式时即形成待付款订单；付款服务的服务器通知会自动更新到账状态。后台查询用于通知延迟或异常对账，不能依据浏览器返回页面判定到账。</p>
        </div>
        <div className="admin-donation-list">
          {orders.length === 0 ? <p className="ranking-empty">当前没有 OPC 订单。</p> : orders.map((order) => (
            <article key={order.id}>
              <div>
                <p className="mono muted">{order.reference} / {opcOrderStatusLabels[order.status]}</p>
                <h3>{order.serviceName}</h3>
                <p>{order.serviceCode} · {order.serviceRevision} · {order.quotedPrice}</p>
                <p>付款金额 ¥{order.payment.amount.decimal} · {order.payment.channel === "wap" ? "手机付款页面" : order.payment.channel === "page" ? "电脑付款页面" : "尚未发起付款"}</p>
                {order.contact?.note ? <p>{order.contact.note}</p> : null}
              </div>
              <div className="admin-donation-meta">
                <strong>{order.contact?.name ?? "联系方式已按保留期清除"}</strong>
                <span className="mono">{order.contact?.phone || "未填手机号"}</span>
                <span className="mono">{order.contact?.email || "未填邮箱"}</span>
                <span className="mono">{order.contact?.wechat || "未填即时通讯账号"}</span>
                <time className="mono">创建 {new Date(order.createdAt).toLocaleString("zh-CN", { hour12: false })}</time>
                <time className="mono">更新 {new Date(order.updatedAt).toLocaleString("zh-CN", { hour12: false })}</time>
                <span className="mono">付款状态 {order.payment.tradeStatus ?? "尚未回传"}</span>
                <span className="mono">付款交易号 {order.payment.tradeNo ?? "—"}</span>
                <span className="mono">收款商户 PID {order.payment.sellerId ?? "尚未绑定"}</span>
                {order.payment.notifiedAt ? <time className="mono">通知 {new Date(order.payment.notifiedAt).toLocaleString("zh-CN", { hour12: false })}</time> : null}
                {order.payment.checkedAt ? <time className="mono">查询 {new Date(order.payment.checkedAt).toLocaleString("zh-CN", { hour12: false })}</time> : null}
              </div>
              <div className="admin-actions">
                {order.status === "awaiting_payment" ? (
                  <>
                    <button className="text-action" type="button" disabled={pending} onClick={() => void reconcileOpcOrder(order)}>查询付款状态</button>
                    <button className="text-link" type="button" disabled={pending} onClick={() => void updateOpcOrder(order, "cancelled")}>取消订单</button>
                  </>
                ) : null}
                {order.status === "paid" ? (
                  <>
                    <button className="text-link" type="button" disabled={pending} onClick={() => void reconcileOpcOrder(order)}>复查付款状态</button>
                    <button className="text-action" type="button" disabled={pending} onClick={() => void updateOpcOrder(order, "completed")}>标记交付完成</button>
                    <button className="text-link" type="button" disabled={pending} onClick={() => void updateOpcOrder(order, "refunded")}>登记已退款</button>
                  </>
                ) : null}
                {order.status === "completed" ? <button className="text-link" type="button" disabled={pending} onClick={() => void updateOpcOrder(order, "refunded")}>登记已退款</button> : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
