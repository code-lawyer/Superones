"use client";

import { FormEvent, useState } from "react";
import { clearFieldError, focusFirstInvalidField, isValidEmail } from "@/lib/client-form-validation";
import { FrontierDialog } from "../frontier-dialog";
import { RulesContent } from "../frontier-copy";

type Step = "form" | "challenge" | "queued" | "verified";
type SubmitField = "repo" | "email" | "note";
type SubmitFieldErrors = Partial<Record<SubmitField, string>>;

type ChallengeResponse = {
  alreadyVerified?: boolean;
  id: string;
  season: string;
  seasonName: string;
  repository: string;
  filePath: string;
  expiresAt: string;
  payload: Record<string, string>;
};

type VerificationResponse = {
  pending?: boolean;
};

async function responseMessage(response: Response) {
  const data = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof data?.error === "string" ? data.error : "请求暂时无法完成，请稍后重试。";
}

export function SubmitForm() {
  const [step, setStep] = useState<Step>("form");
  const [repo, setRepo] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SubmitFieldErrors>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: SubmitFieldErrors = {};
    try {
      const repositoryUrl = new URL(repo);
      if (repositoryUrl.protocol !== "https:" || repositoryUrl.hostname !== "github.com" || repositoryUrl.pathname.split("/").filter(Boolean).length < 2) {
        nextErrors.repo = "请输入当前支持的公开代码仓库完整 HTTPS 地址。";
      }
    } catch {
      nextErrors.repo = "请输入有效的公开代码仓库地址。";
    }
    if (!isValidEmail(email)) {
      nextErrors.email = "请输入可接收资格确认通知的有效邮箱。";
    }
    if (note.trim().length < 6) {
      nextErrors.note = "请至少用 6 个字符说明你正在创造什么。";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      focusFirstInvalidField(["repo", "email", "note"], nextErrors);
      return;
    }

    setPending(true);
    setError("");
    setFieldErrors({});
    try {
      const response = await fetch("/api/frontier/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, email, note, rulesAccepted }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const result = await response.json() as ChallengeResponse;
      setChallenge(result);
      setStep(result.alreadyVerified ? "verified" : "challenge");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法生成验证文件。" );
    } finally {
      setPending(false);
    }
  }

  async function verifyRepository() {
    if (!challenge) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/frontier/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: challenge.id }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const result = await response.json() as VerificationResponse;
      setStep(response.status === 202 || result.pending ? "queued" : "verified");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法验证仓库。" );
    } finally {
      setPending(false);
    }
  }

  function reset() {
    setStep("form");
    setRepo("");
    setEmail("");
    setNote("");
    setChallenge(null);
    setRulesAccepted(false);
    setError("");
    setFieldErrors({});
  }

  if (step === "queued" && challenge) {
    return (
      <div className="verification-result" role="status">
        <p className="eyebrow mono">PENDING / ASYNC VERIFICATION</p>
        <h2>仓库正在异步核验。</h2>
        <p><span className="mono">{challenge.repository}</span> 的挑战文件已进入公开仓库核验队列。境内无法直接读取仓库时，系统会通过境外采集链路完成检查；当前尚未计入榜单。</p>
        <p className="verification-warning"><strong>请保留挑战文件。</strong>无需重新报名或修改文件；核验完成后，项目会自动进入当前赛季榜单。</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-actions">
          <button className="text-action" type="button" disabled={pending} onClick={verifyRepository}>{pending ? "正在检查" : "重新检查核验状态"}</button>
          <button className="text-link" type="button" disabled={pending} onClick={reset}>提交另一个仓库</button>
        </div>
      </div>
    );
  }

  if (step === "verified" && challenge) {
    return (
      <div className="verification-result" role="status">
        <p className="eyebrow mono">VERIFIED / {challenge.season}</p>
        <h2>仓库已通过验证。</h2>
        <p><span className="mono">{challenge.repository}</span> 已加入 {challenge.seasonName}。{challenge.alreadyVerified ? "这是现有有效报名，不需要重新生成挑战文件。" : "系统已记录验证时的 Star 基线，公开榜单通常会在 30 秒内显示；当前 Star 在北京时间 08:45–22:45 每两小时更新。"}</p>
        <p className="verification-warning"><strong>不要删除挑战文件。</strong>网站将在赛季结算时再次检查；文件缺失或内容改变会使项目失去最终排名和随机奖品资格。</p>
        <button className="text-link" type="button" onClick={reset}>提交另一个仓库</button>
      </div>
    );
  }

  if (step === "challenge" && challenge) {
    const payload = JSON.stringify(challenge.payload, null, 2);
    return (
      <div className="challenge-panel">
        <p className="eyebrow mono">STEP 02 / OWNERSHIP CHECK</p>
        <h2>把验证文件提交到默认分支。</h2>
        <p>在仓库根目录创建 <code>{challenge.filePath}</code>，写入以下内容。该挑战码仅用于验证你能修改此仓库，不是账号密钥。</p>
        <pre>{payload}</pre>
        <p className="form-note mono">初次验证有效至 {new Date(challenge.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</p>
        <p className="challenge-retention">验证成功后，文件仍须原样保留至赛季结算。</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-actions">
          <button className="text-action" type="button" disabled={pending} onClick={verifyRepository}>{pending ? "正在验证" : "验证仓库"}</button>
          <button className="text-link" type="button" disabled={pending} onClick={() => { setStep("form"); setError(""); }}>返回修改</button>
        </div>
      </div>
    );
  }

  return (
    <form className="submission-form" onSubmit={handleSubmit} noValidate>
      <div className="form-field">
        <label htmlFor="repo">公开代码仓库地址</label>
        <input
          id="repo"
          name="repo"
          type="url"
          placeholder="完整 HTTPS 仓库地址"
          value={repo}
          onChange={(event) => {
            setRepo(event.target.value);
            setFieldErrors((current) => clearFieldError(current, "repo"));
          }}
          disabled={pending}
          required
          aria-invalid={fieldErrors.repo ? true : undefined}
          aria-describedby={fieldErrors.repo ? "repo-error" : undefined}
        />
        {fieldErrors.repo ? <p className="form-error" id="repo-error">{fieldErrors.repo}</p> : null}
      </div>
      <div className="form-field">
        <label htmlFor="email">联系邮箱</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setFieldErrors((current) => clearFieldError(current, "email"));
          }}
          disabled={pending}
          required
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? "email-hint email-error" : "email-hint"}
        />
        <p id="email-hint">仅用于资格确认、获奖通知和奖品发放，不会公开。</p>
        {fieldErrors.email ? <p className="form-error" id="email-error">{fieldErrors.email}</p> : null}
      </div>
      <div className="form-field">
        <label htmlFor="note">项目说明</label>
        <textarea
          id="note"
          name="note"
          rows={4}
          minLength={6}
          maxLength={180}
          placeholder="用一句话说明你正在创造什么。"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setFieldErrors((current) => clearFieldError(current, "note"));
          }}
          disabled={pending}
          required
          aria-invalid={fieldErrors.note ? true : undefined}
          aria-describedby={fieldErrors.note ? "note-error" : undefined}
        />
        {fieldErrors.note ? <p className="form-error" id="note-error">{fieldErrors.note}</p> : null}
      </div>
      <div className="rules-consent">
        <FrontierDialog trigger="查看完整参赛规则" title="边境计划参赛规则" eyebrow="FRONTIER / RULES"><RulesContent /></FrontierDialog>
        <label className="consent-check">
          <input type="checkbox" checked={rulesAccepted} onChange={(event) => setRulesAccepted(event.target.checked)} disabled={pending} />
          <span>我已阅读并同意边境计划参赛规则。</span>
        </label>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="form-actions"><button className="text-action" type="submit" disabled={pending || !rulesAccepted}>{pending ? "正在检查仓库" : "生成验证文件"}</button></div>
    </form>
  );
}
