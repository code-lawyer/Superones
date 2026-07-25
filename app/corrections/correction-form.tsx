"use client";

import { FormEvent, useState } from "react";

export function CorrectionForm({ initialRecord, initialType }: {
  initialRecord: string;
  initialType: "event" | "information";
}) {
  const [recordId, setRecordId] = useState(initialRecord);
  const [recordType, setRecordType] = useState(initialType);
  const [issueType, setIssueType] = useState("factual_error");
  const [pageUrl, setPageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, recordType, issueType, pageUrl, description, evidenceUrl, email }),
      });
      const body = await response.json().catch(() => null) as { error?: unknown; id?: unknown } | null;
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "暂时无法提交纠错。");
      setMessage(`报告已登记，编号 ${body?.id ?? "已生成"}。工作人员会依据原始证据人工处理。`);
      setDescription("");
      setEvidenceUrl("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法提交纠错。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="submission-form" onSubmit={submit}>
      <div className="form-field">
        <label htmlFor="correction-record">记录号或页面内标识</label>
        <input id="correction-record" value={recordId} onChange={(event) => setRecordId(event.target.value)} maxLength={180} required />
      </div>
      <div className="form-field">
        <label htmlFor="correction-record-type">记录类型</label>
        <select id="correction-record-type" value={recordType} onChange={(event) => setRecordType(event.target.value as "event" | "information")}>
          <option value="event">事件</option>
          <option value="information">资讯</option>
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="correction-issue">问题类型</label>
        <select id="correction-issue" value={issueType} onChange={(event) => setIssueType(event.target.value)}>
          <option value="incorrect_merge">误合并</option>
          <option value="factual_error">信息错误</option>
          <option value="source_unavailable">来源失效</option>
        </select>
      </div>
      <div className="form-field">
        <label htmlFor="correction-page">对应页面地址（可选）</label>
        <input id="correction-page" type="url" value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} maxLength={500} />
      </div>
      <div className="form-field">
        <label htmlFor="correction-description">具体问题</label>
        <textarea id="correction-description" value={description} onChange={(event) => setDescription(event.target.value)} minLength={12} maxLength={1500} rows={7} required />
      </div>
      <div className="form-field">
        <label htmlFor="correction-evidence">支持更正的 HTTPS 原始依据</label>
        <input id="correction-evidence" type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} required />
      </div>
      <div className="form-field">
        <label htmlFor="correction-email">联系邮箱（可选，不公开）</label>
        <input id="correction-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="admin-notice" role="status">{message}</p> : null}
      <button className="text-action" type="submit" disabled={pending}>{pending ? "正在提交" : "提交纠错报告"}</button>
    </form>
  );
}
