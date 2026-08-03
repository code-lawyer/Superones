"use client";

import { FormEvent, useState } from "react";
import { clearFieldError, focusFirstInvalidField, isValidEmail } from "@/lib/client-form-validation";
import { DonationNotice } from "../frontier-copy";

type DonationField = "prize-name" | "prize-description" | "prize-email";
type DonationFieldErrors = Partial<Record<DonationField, string>>;

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
  const [fieldErrors, setFieldErrors] = useState<DonationFieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: DonationFieldErrors = {};
    if (name.trim().length < 2) nextErrors["prize-name"] = "奖品名称至少需要 2 个字符。";
    if (description.trim().length < 6) nextErrors["prize-description"] = "请至少用 6 个字符说明获奖者会收到什么。";
    if (!isValidEmail(email)) nextErrors["prize-email"] = "请输入可用于确认和交付的有效邮箱。";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      focusFirstInvalidField(["prize-name", "prize-description", "prize-email"], nextErrors);
      return;
    }

    setPending(true);
    setError("");
    setFieldErrors({});
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
        <button className="text-link" type="button" onClick={() => { setSubmitted(false); setName(""); setDescription(""); setEmail(""); setNoticeAccepted(false); setFieldErrors({}); }}>继续捐献奖品</button>
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
        <input
          id="prize-name"
          type="text"
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setFieldErrors((current) => clearFieldError(current, "prize-name"));
          }}
          disabled={pending}
          required
          aria-invalid={fieldErrors["prize-name"] ? true : undefined}
          aria-describedby={fieldErrors["prize-name"] ? "prize-name-error" : undefined}
        />
        {fieldErrors["prize-name"] ? <p className="form-error" id="prize-name-error">{fieldErrors["prize-name"]}</p> : null}
      </div>
      <div className="form-field">
        <label htmlFor="prize-description">奖品说明</label>
        <textarea
          id="prize-description"
          rows={6}
          minLength={6}
          maxLength={600}
          placeholder="说明奖品是什么，以及获得者实际会收到什么。"
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            setFieldErrors((current) => clearFieldError(current, "prize-description"));
          }}
          disabled={pending}
          required
          aria-invalid={fieldErrors["prize-description"] ? true : undefined}
          aria-describedby={fieldErrors["prize-description"] ? "prize-description-error" : undefined}
        />
        {fieldErrors["prize-description"] ? <p className="form-error" id="prize-description-error">{fieldErrors["prize-description"]}</p> : null}
      </div>
      <div className="form-field">
        <label htmlFor="prize-email">联系 Email</label>
        <input
          id="prize-email"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setFieldErrors((current) => clearFieldError(current, "prize-email"));
          }}
          disabled={pending}
          required
          aria-invalid={fieldErrors["prize-email"] ? true : undefined}
          aria-describedby={fieldErrors["prize-email"] ? "prize-email-hint prize-email-error" : "prize-email-hint"}
        />
        <p id="prize-email-hint">只用于确认奖品和后续交付，不会公开展示。</p>
        {fieldErrors["prize-email"] ? <p className="form-error" id="prize-email-error">{fieldErrors["prize-email"]}</p> : null}
      </div>
      <div className="donation-form__commit">
        <label className="consent-check">
          <input type="checkbox" checked={noticeAccepted} onChange={(event) => setNoticeAccepted(event.target.checked)} disabled={pending} />
          <span>我已阅读并同意《奖品捐献须知》。</span>
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-actions"><button className="text-action" type="submit" disabled={pending || !noticeAccepted}>{pending ? "正在提交" : "确认捐献奖品"}</button></div>
      </div>
    </form>
  );
}
