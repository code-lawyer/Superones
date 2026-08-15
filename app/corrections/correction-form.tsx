"use client";

import { FormEvent, useState } from "react";
import { clearFieldError, focusFirstInvalidField } from "@/lib/client-form-validation";
import {
  validateCorrectionFields,
  type CorrectionField,
  type CorrectionFieldErrors,
} from "@/lib/correction-validation";

const FIELD_IDS: Record<CorrectionField, string> = {
  recordId: "correction-record",
  pageUrl: "correction-page",
  description: "correction-description",
  evidenceUrl: "correction-evidence",
  email: "correction-email",
};

const FIELD_ORDER = Object.keys(FIELD_IDS) as CorrectionField[];

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
  const [fieldErrors, setFieldErrors] = useState<CorrectionFieldErrors>({});

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validateCorrectionFields({ recordId, pageUrl, description, evidenceUrl, email });
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError("");
      setMessage("");
      focusFirstInvalidField(FIELD_ORDER.map((field) => FIELD_IDS[field]), Object.fromEntries(
        Object.entries(nextErrors).map(([field, message]) => [FIELD_IDS[field as CorrectionField], message]),
      ));
      return;
    }
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, recordType, issueType, pageUrl, description, evidenceUrl, email }),
      });
      const body = await response.json().catch(() => null) as { error?: unknown; id?: unknown; fieldErrors?: CorrectionFieldErrors } | null;
      if (!response.ok) {
        if (body?.fieldErrors && Object.keys(body.fieldErrors).length > 0) {
          setFieldErrors(body.fieldErrors);
          focusFirstInvalidField(FIELD_ORDER.map((field) => FIELD_IDS[field]), Object.fromEntries(
            Object.entries(body.fieldErrors).map(([field, message]) => [FIELD_IDS[field as CorrectionField], message]),
          ));
        }
        throw new Error(typeof body?.error === "string" ? body.error : "暂时无法提交纠错。");
      }
      setMessage(`报告已登记，编号 ${body?.id ?? "已生成"}。工作人员会依据原始证据人工处理。`);
      setDescription("");
      setEvidenceUrl("");
      setFieldErrors({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法提交纠错。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="submission-form" onSubmit={submit} noValidate>
      <div className="form-field">
        <label htmlFor="correction-record">记录号或页面内标识</label>
        <input id="correction-record" value={recordId} onChange={(event) => { setRecordId(event.target.value); setFieldErrors((current) => clearFieldError(current, "recordId")); }} maxLength={180} required aria-invalid={fieldErrors.recordId ? true : undefined} aria-describedby={fieldErrors.recordId ? "correction-record-error" : undefined} />
        {fieldErrors.recordId ? <p className="form-error" id="correction-record-error">{fieldErrors.recordId}</p> : null}
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
        <input id="correction-page" type="url" value={pageUrl} onChange={(event) => { setPageUrl(event.target.value); setFieldErrors((current) => clearFieldError(current, "pageUrl")); }} maxLength={500} aria-invalid={fieldErrors.pageUrl ? true : undefined} aria-describedby={fieldErrors.pageUrl ? "correction-page-error" : undefined} />
        {fieldErrors.pageUrl ? <p className="form-error" id="correction-page-error">{fieldErrors.pageUrl}</p> : null}
      </div>
      <div className="form-field">
        <label htmlFor="correction-description">具体问题</label>
        <textarea id="correction-description" value={description} onChange={(event) => { setDescription(event.target.value); setFieldErrors((current) => clearFieldError(current, "description")); }} minLength={12} maxLength={1500} rows={7} required aria-invalid={fieldErrors.description ? true : undefined} aria-describedby={fieldErrors.description ? "correction-description-error" : undefined} />
        {fieldErrors.description ? <p className="form-error" id="correction-description-error">{fieldErrors.description}</p> : null}
      </div>
      <div className="form-field">
        <label htmlFor="correction-evidence">支持更正的 HTTPS 原始依据</label>
        <input id="correction-evidence" type="url" value={evidenceUrl} onChange={(event) => { setEvidenceUrl(event.target.value); setFieldErrors((current) => clearFieldError(current, "evidenceUrl")); }} required aria-invalid={fieldErrors.evidenceUrl ? true : undefined} aria-describedby={fieldErrors.evidenceUrl ? "correction-evidence-hint correction-evidence-error" : "correction-evidence-hint"} />
        <p id="correction-evidence-hint">必须是可公开访问、以 https:// 开头的一手资料。</p>
        {fieldErrors.evidenceUrl ? <p className="form-error" id="correction-evidence-error">{fieldErrors.evidenceUrl}</p> : null}
      </div>
      <div className="form-field">
        <label htmlFor="correction-email">联系邮箱（可选，不公开）</label>
        <input id="correction-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setFieldErrors((current) => clearFieldError(current, "email")); }} aria-invalid={fieldErrors.email ? true : undefined} aria-describedby={fieldErrors.email ? "correction-email-error" : undefined} />
        {fieldErrors.email ? <p className="form-error" id="correction-email-error">{fieldErrors.email}</p> : null}
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="admin-notice" role="status">{message}</p> : null}
      <button className="text-action" type="submit" disabled={pending}>{pending ? "正在提交" : "提交纠错报告"}</button>
    </form>
  );
}
