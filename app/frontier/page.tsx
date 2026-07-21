import type { Metadata } from "next";
import Link from "next/link";
import { FrontierRanking } from "@/components/frontier-ranking";
import { PageIntro } from "@/components/page-intro";
import { prizes, siteStatus } from "@/lib/data";
import { listPublicRankings } from "@/lib/frontier-store";

export const metadata: Metadata = { title: "边境计划" };
export const dynamic = "force-dynamic";

export default async function FrontierPage() {
  const rankings = await listPublicRankings();
  return (
    <>
      <PageIntro code="FRONTIER / PERPETUAL HACKATHON" title="把公开建设，变成一场永不落幕的竞赛。" lead="无需登录。提交公开开源仓库，通过所有权验证，从报名通过后的 Star 基线开始竞争。" meta={`${siteStatus.season} / ${siteStatus.seasonState} / ${siteStatus.settlement} 结算`} />
      <section className="shell frontier-status">
        <div className="frontier-clock">
          <p className="eyebrow mono">CURRENT SEASON</p>
          <p className="frontier-season">2026<br />夏季赛</p>
        </div>
        <div className="frontier-rule-summary">
          <div><span className="mono">报名</span><strong>全赛季开放</strong></div>
          <div><span className="mono">排名</span><strong>净新增 Star</strong></div>
          <div><span className="mono">结算</span><strong>09 月 30 日</strong></div>
          <div><span className="mono">获奖</span><strong>前三名依次选奖</strong></div>
          <Link className="text-action" href="/frontier/submit">提交仓库</Link>
        </div>
      </section>
      <section className="shell content-section">
        <div className="section-heading">
          <p className="eyebrow mono">LIVE RANKING</p>
          <div className="section-heading__main"><h2>当前排名</h2><Link className="text-link section-link" href="/frontier/ranking">查看完整榜单</Link></div>
        </div>
        <FrontierRanking items={rankings.slice(0, 5)} />
      </section>
      <section className="prize-section">
        <div className="shell">
          <div className="section-heading"><p className="eyebrow mono">PRIZE POOL</p><div className="section-heading__main"><h2>当季奖池</h2><p className="section-description">第一名先选，第二名其次，第三名最后。</p></div></div>
          <ol className="prize-list">
            {prizes.map((prize, index) => <li key={prize}><span className="mono">{String(index + 1).padStart(2, "0")}</span><strong>{prize}</strong><span className="mono muted">AVAILABLE</span></li>)}
          </ol>
        </div>
      </section>
      <section className="shell frontier-rules">
        <div><p className="eyebrow mono">ELIGIBILITY</p><h2>谁可以参加</h2></div>
        <div className="rules-copy">
          <p>仓库必须公开，包含明确的开源许可证、可运行代码或可验证成果，以及用途清楚的 README。</p>
          <p>纯 Fork、空壳、搬运、恶意软件和以刷 Star 为目的的页面不得参赛。获奖仓库进入荣誉榜，不再参加后续赛季。</p>
          <Link className="text-link" href="/terms">阅读完整规则</Link>
        </div>
      </section>
    </>
  );
}
