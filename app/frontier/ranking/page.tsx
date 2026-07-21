import type { Metadata } from "next";
import Link from "next/link";
import { FrontierRanking } from "@/components/frontier-ranking";
import { PageIntro } from "@/components/page-intro";
import { listPublicRankings } from "@/lib/frontier-store";

export const metadata: Metadata = { title: "边境计划排行榜" };
export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const rankings = await listPublicRankings();
  return (
    <>
      <PageIntro code="FRONTIER / RANKING" title="每一颗 Star，都从验证通过后开始计算。" lead="排行榜展示基线、当前值和净新增值。最终结果在赛季结算时进行资格与异常复核。" meta="2026 夏季赛 / 2026.09.30 23:59:59 CST 结算" />
      <section className="shell content-section"><FrontierRanking items={rankings} /></section>
      <section className="shell archive-section">
        <div className="section-heading"><p className="eyebrow mono">HALL OF RECORDS</p><div className="section-heading__main"><h2>历史获奖项目</h2></div></div>
        <p className="ranking-empty">首个赛季尚未结算。获得前三名的仓库会在这里保留为荣誉记录。</p>
        <Link className="text-action" href="/frontier/submit">提交本赛季仓库</Link>
      </section>
    </>
  );
}
