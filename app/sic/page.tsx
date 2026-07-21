import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { TrendList } from "@/components/trend-list";
import { projects } from "@/lib/data";

export const metadata: Metadata = { title: "SiC 学院" };

export default function SicPage() {
  return (
    <>
      <PageIntro code="SiC / SILICON × CARBON" title="硅提供杠杆，碳决定方向。" lead="在机器智能与人的判断之间，探索超级个体持续进化的道路。" meta="24H VELOCITY / CAPTURED 2026.07.21 14:00 CST" />
      <section className="shell sic-manifesto">
        <p className="manifesto-mark mono">Si × C</p>
        <p>我们追踪机器能力的边界，也保留人对方向、价值与责任的判断。榜单不是答案，只是变化发生的坐标。</p>
      </section>
      <section className="shell content-section">
        <div className="filter-row" aria-label="趋势时间范围">
          <button className="filter-button is-active" type="button">正在爆发 / 24H</button>
          <button className="filter-button" type="button">本周热门 / 7D</button>
          <button className="filter-button" type="button">长期热门</button>
        </div>
        <TrendList items={projects} />
        <p className="method-note mono">排名优先考虑近期 Star 增速。累计 Star 仅作为辅助信息。当前页面使用示例数据。</p>
      </section>
    </>
  );
}
