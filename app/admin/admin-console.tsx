"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Submission = {
  id: string;
  repository: string;
  email: string;
  note: string;
  status: "pending" | "verified" | "disqualified";
  createdAt: string;
  verifiedAt: string | null;
  baselineStars: number | null;
  currentStars: number | null;
  lastSnapshotAt: string | null;
};

async function jsonMessage(response: Response) {
  const body = await response.json().catch(() => null) as { error?: unknown; submissions?: Submission[]; refreshed?: unknown; failed?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "请求暂时无法完成。");
  return body;
}

export function AdminConsole() {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/frontier", { cache: "no-store" });
    if (response.status === 401) {
      setSubmissions(null);
      return;
    }
    const body = await jsonMessage(response);
    setSubmissions(Array.isArray(body?.submissions) ? body.submissions : []);
  }, []);

  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "无法读取运营数据。")); }, [load]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
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
    setPending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/frontier", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh-stars" }) });
      const body = await jsonMessage(response);
      setSubmissions(Array.isArray(body?.submissions) ? body.submissions : []);
      setNotice(`已刷新 ${body?.refreshed ?? 0} 个仓库${body?.failed ? `，${body.failed} 个仓库暂时无法读取` : ""}。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法刷新 Star。" );
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setSubmissions(null);
    setNotice("");
  }

  if (submissions === null) {
    return (
      <form className="admin-login" onSubmit={login}>
        <p className="eyebrow mono">SHARED OPERATOR ACCESS</p>
        <h2>进入运营后台。</h2>
        <div className="form-field">
          <label htmlFor="admin-password">共享密码</label>
          <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} required />
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="text-action" type="submit" disabled={pending}>{pending ? "正在登录" : "进入后台"}</button>
        <p className="form-note mono">生产环境通过 VAULT2077_ADMIN_PASSWORD 配置共享密码。</p>
      </form>
    );
  }

  return (
    <section className="admin-console">
      <div className="admin-console__top">
        <div><p className="eyebrow mono">FRONTIER / OPERATOR VIEW</p><h2>报名与 Star 快照</h2></div>
        <div className="admin-actions"><button className="text-action" type="button" disabled={pending} onClick={refreshStars}>{pending ? "正在刷新" : "刷新 Star"}</button><button className="text-link" type="button" onClick={logout}>退出后台</button></div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="admin-notice" role="status">{notice}</p> : null}
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
    </section>
  );
}
