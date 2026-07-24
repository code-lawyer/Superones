"use client";

import { FormEvent, useState } from "react";
import { DonationNotice } from "../frontier-copy";

async function responseMessage(response: Response) {
  const data = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof data?.error === "string" ? data.error : "请求暂时无法完成，请稍后重试。";
}

export function DonationForm({ seasonName }: { seasonName: string }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [noticeAccepted, setNoticeAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/frontier/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, email, noticeAccepted }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法提交奖品。");
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <div className="verification-result" role="status">
        <p className="eyebrow mono">DONATION RECEIVED / {seasonName}</p>
        <h2>奖品已提交。</h2>
        <p>确认后将以匿名方式进入对应赛季随机奖池。公开奖池不会显示你的 Email。</p>
        <button className="text-link" type="button" onClick={() => { setSubmitted(false); setName(""); setDescription(""); setEmail(""); setNoticeAccepted(false); }}>继续捐献奖品</button>
      </div>
    );
  }

  return (
    <form className="donation-form" onSubmit={submit} noValidate>
      <section className="donation-notice" aria-labelledby="donation-notice-title">
        <p className="eyebrow mono">DONATION NOTICE</p>
        <h2 id="donation-notice-title">奖品捐献须知</h2>
        <DonationNotice />
      </section>
      <div className="form-field">
        <label htmlFor="prize-name">奖品名称</label>
        <input id="prize-name" type="text" minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} disabled={pending} required />
      </div>
      <div className="form-field">
        <label htmlFor="prize-description">奖品说明</label>
        <textarea id="prize-description" rows={6} minLength={6} maxLength={600} placeholder="说明奖品是什么，以及获得者实际会收到什么。" value={description} onChange={(event) => setDescription(event.target.value)} disabled={pending} required />
      </div>
      <div className="form-field">
        <label htmlFor="prize-email">联系 Email</label>
        <input id="prize-email" type="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} required />
        <p>只用于确认奖品和后续交付，不会公开展示。</p>
      </div>
      <label className="consent-check">
        <input type="checkbox" checked={noticeAccepted} onChange={(event) => setNoticeAccepted(event.target.checked)} disabled={pending} />
        <span>我已阅读并同意《奖品捐献须知》。</span>
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions"><button className="text-action" type="submit" disabled={pending || !noticeAccepted}>{pending ? "正在提交" : "确认捐献奖品"}</button></div>
    </form>
  );
}
