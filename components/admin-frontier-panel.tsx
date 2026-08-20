"use client";

import type {
  AdminContentState,
  AdminFrontierDonation,
  AdminFrontierSeasonConfiguration,
  AdminFrontierSubmission,
} from "@/lib/admin-contract";

type DonationAction = "confirm-donation" | "reject-donation" | "withdraw-donation";
type SeasonAction = "save-season-reward" | "publish-season-reward";

export function AdminFrontierPanel({
  submissions,
  donations,
  seasonConfiguration,
  seasonReward,
  pending,
  onSeasonRewardChange,
  onSeasonAction,
  onDonationAction,
}: {
  submissions: AdminFrontierSubmission[];
  donations: AdminFrontierDonation[];
  seasonConfiguration: AdminFrontierSeasonConfiguration | null;
  seasonReward: string;
  pending: boolean;
  onSeasonRewardChange(value: string): void;
  onSeasonAction(action: SeasonAction): void;
  onDonationAction(donationId: string, action: DonationAction): void;
}) {
  return <>
    <section className="admin-donations" aria-labelledby="admin-season-reward-title">
      <div className="admin-section-heading">
        <p className="eyebrow mono">FRONTIER / SEASON CONTROL</p>
        <h2 id="admin-season-reward-title">本赛季官方奖励</h2>
        <p className="form-note">每个赛季先保存草稿，再经五分钟内重新认证后发布。未发布时赛季显示准备中，报名、验证和捐献接口全部关闭。</p>
      </div>
      <div className="form-field">
        <label htmlFor="frontier-season-reward">奖励公开文案</label>
        <input id="frontier-season-reward" value={seasonReward} onChange={(event) => onSeasonRewardChange(event.target.value)} minLength={4} maxLength={200} disabled={pending} placeholder="例如：冠军奖金人民币 10,000 元" />
      </div>
      <p className="form-note">
        {seasonConfiguration?.season ?? "当前赛季"} · {seasonConfiguration?.status === "published" ? "已发布" : "草稿"} · 对外组织：边境计划管理局 · 获奖者承担依法归属于其本人的税费 · 赛季结束后 7 日内开放奖励确认与发放流程
      </p>
      <div className="admin-actions">
        <button className="text-link" type="button" disabled={pending || seasonReward.trim().length < 4} onClick={() => onSeasonAction("save-season-reward")}>保存草稿</button>
        <button className="text-action" type="button" disabled={pending || seasonConfiguration?.status !== "draft" || !seasonConfiguration.officialReward} onClick={() => onSeasonAction("publish-season-reward")}>发布并开放本赛季</button>
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
              {donation.status === "pending_confirmation" ? <><button className="text-action" type="button" disabled={pending} onClick={() => onDonationAction(donation.id, "confirm-donation")}>确认并公开</button><button className="text-link" type="button" disabled={pending} onClick={() => onDonationAction(donation.id, "reject-donation")}>拒绝</button></> : null}
              {donation.status === "available" || donation.status === "carried_over" ? <button className="text-link" type="button" disabled={pending} onClick={() => onDonationAction(donation.id, "withdraw-donation")}>撤回奖品</button> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  </>;
}

export function AdminPipelineSummary({ state }: { state: AdminContentState | null }) {
  return <section className="admin-pipeline" id="admin-overview" aria-label="信息管道状态">
    <p className="eyebrow mono">CONTENT PIPELINE / DOMESTIC VIEW</p>
    <h2>信息管道状态</h2>
    {state ? (
      <div className="admin-pipeline__metrics mono">
        <span>MODE <strong>{state.mode.toUpperCase()}</strong></span>
        <span>SOURCES <strong>{state.sourceCount}</strong></span>
        <span>EVENTS <strong>{state.eventCount}</strong></span>
        <span>PROJECTS <strong>{state.projectCount}</strong></span>
        <span>LAST RUN <strong>{state.updatedAt ? new Date(state.updatedAt).toLocaleString("zh-CN", { hour12: false }) : "—"}</strong></span>
      </div>
    ) : <p className="ranking-empty">暂时无法读取信息管道状态。</p>}
  </section>;
}
