import type { Metadata } from "next";
import Link from "next/link";
import { FrontierRanking } from "@/components/frontier-ranking";
import { PageIntro } from "@/components/page-intro";
import { beijingSeasonDate } from "@/lib/frontier-domain";
import { currentSeason, latestRankingUpdate, listPublicRankings } from "@/lib/frontier-store";

export const metadata: Metadata = { title: "边境计划排行榜" };
export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const season = currentSeason();
  const [rankings, updatedAt] = await Promise.all([listPublicRankings(season.code), latestRankingUpdate(season.code)]);
  return (
    <>
      <PageIntro code="FRONTIER / RANKING" title="每一颗 Star，都从验证通过后开始计算。" lead="排行榜每小时更新。赛季结算时重新检查仓库资格与挑战文件，再冻结最终结果。" meta={`${season.name} / ${beijingSeasonDate(season.endsAt)} 结算 / 最近更新 ${updatedAt ? new Date(updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "等待首次更新"}`} />
      <section className="shell content-section"><FrontierRanking items={rankings} /></section>
      <section className="shell archive-section">
        <div className="section-heading"><p className="eyebrow mono">FINAL CHECK</p><div className="section-heading__main"><h2>结算时再次验证。</h2></div></div>
        <p className="ranking-empty">挑战文件必须保留到赛季末。结算时文件缺失或仓库不再符合机器资格，将失去最终排名和随机奖品资格。</p>
        <Link className="text-action" href="/frontier/submit">提交本赛季仓库</Link>
      </section>
    </>
  );
}
