"use client";

import { FormEvent, useState } from "react";
import { FrontierDialog } from "../frontier-dialog";
import { RulesContent } from "../frontier-copy";

type Step = "form" | "challenge" | "verified";

type ChallengeResponse = {
  id: string;
  season: string;
  seasonName: string;
  repository: string;
  filePath: string;
  expiresAt: string;
  payload: Record<string, string>;
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
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/frontier/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, email, note, rulesAccepted }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setChallenge(await response.json() as ChallengeResponse);
      setStep("challenge");
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
      setStep("verified");
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
  }

  if (step === "verified" && challenge) {
    return (
      <div className="verification-result" role="status">
        <p className="eyebrow mono">VERIFIED / {challenge.season}</p>
        <h2>仓库已通过验证。</h2>
        <p><span className="mono">{challenge.repository}</span> 已加入 {challenge.seasonName}。系统已记录验证时的 Star 基线，排行榜会在下一次小时更新后显示。</p>
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
        <label htmlFor="repo">公开 GitHub 仓库地址</label>
        <input id="repo" name="repo" type="url" placeholder="https://github.com/owner/repository" value={repo} onChange={(event) => setRepo(event.target.value)} disabled={pending} required />
      </div>
      <div className="form-field">
        <label htmlFor="email">联系邮箱</label>
        <input id="email" name="email" type="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} required />
        <p>仅用于资格确认、获奖通知和奖品发放，不会公开。</p>
      </div>
      <div className="form-field">
        <label htmlFor="note">项目说明</label>
        <textarea id="note" name="note" rows={4} minLength={6} maxLength={180} placeholder="用一句话说明你正在创造什么。" value={note} onChange={(event) => setNote(event.target.value)} disabled={pending} required />
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
