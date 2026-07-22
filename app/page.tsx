import Link from "next/link";
import { EventList } from "@/components/event-list";
import { FrontierRanking } from "@/components/frontier-ranking";
import { SectionHeading } from "@/components/section-heading";
import { ServiceList } from "@/components/service-list";
import { StatusBar } from "@/components/status-bar";
import { TrendList } from "@/components/trend-list";
import { services, siteStatus } from "@/lib/data";
import { listPublicRankings } from "@/lib/frontier-store";
import { getPublicContent } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [frontierRankings, content] = await Promise.all([listPublicRankings(), getPublicContent()]);
  return (
    <>
      <StatusBar state={content.state} />
      <section className="hero shell">
        <aside className="hero-spine" aria-label="系统档案信息">
          <p className="mono">VAULT2077 / SYSTEM DOSSIER</p>
          <dl>
            <div><dt>版本</dt><dd className="mono">REV.02</dd></div>
            <div><dt>对象</dt><dd>一人公司</dd></div>
            <div><dt>范围</dt><dd>情报 · 经营 · 进化 · 建造</dd></div>
            <div><dt>状态</dt><dd>持续运行</dd></div>
          </dl>
        </aside>
        <div className="hero-copy">
          <p className="eyebrow mono">OPERATING SYSTEM / ONE-PERSON COMPANY</p>
          <h1>一人公司，<br />全栈运行。</h1>
          <p className="hero-lead">为超级个体提供持续情报、标准化经营服务、技术趋势与开放实验场。</p>
          <div className="hero-actions">
            <Link className="text-action" href="/feed">查看今日记录</Link>
            <Link className="text-link" href="/opc">浏览 OPC 服务</Link>
          </div>
        </div>
        <div className="hero-folio mono" aria-hidden="true"><span>V</span><span>2077</span></div>
      </section>

      <section className="home-section home-section--vault shell">
        <SectionHeading code="VAULT / LATEST" title="最新事件" description="机器采集，境内摘要，按事件持续更新。" href="/feed" />
        <EventList items={content.events.slice(0, 5)} />
      </section>

      <section className="home-section home-section--dark home-section--opc">
        <div className="shell">
          <SectionHeading code="OPC / FIXED SCOPE" title="固定价格的基础服务" description="专业经验被封装成明确范围、材料、周期与交付成果。" href="/opc" linkLabel="查看服务菜单" />
          <ServiceList items={services.slice(0, 4)} />
          <div className="section-cta">
            <p>需要判断哪项服务适合你？</p>
            <Link className="text-action" href="/opc#contact">查看联系方式</Link>
          </div>
        </div>
      </section>

      <section className="home-section home-section--sic shell">
        <SectionHeading code="SiC / VELOCITY" title="硅提供杠杆，碳决定方向。" description="在机器智能与人的判断之间，探索超级个体持续进化的道路。" href="/sic" linkLabel="查看完整趋势" />
        <TrendList items={content.projects.slice(0, 5)} />
      </section>

      <section className="home-section home-section--frontier shell frontier-preview">
        <SectionHeading code="FRONTIER / 2026 SUMMER" title="边境计划" description={`全季开放报名，${siteStatus.settlement} 按净新增 Star 结算。`} href="/frontier" linkLabel="了解本赛季" />
        <FrontierRanking items={frontierRankings.slice(0, 3)} />
        <div className="section-cta section-cta--line">
          <p>无需登录。提交公开 GitHub 仓库，完成一次性挑战文件验证。</p>
          <Link className="text-action" href="/frontier/submit">提交仓库</Link>
        </div>
      </section>
    </>
  );
}
