import Link from "next/link";
import { formatNumber } from "@/lib/data";
import { beijingTime, compareEventsNewest, eventCategory, eventJudgment } from "@/lib/feed-format";
import { seasonForDate } from "@/lib/frontier-domain";
import { infrastructureServices, rangerProfiles, specialtyServices } from "@/lib/opc-catalog";
import { getCachedDirectRankingBoards, getCachedPublicContent } from "@/lib/public-read-cache";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [content, rankingBoards] = await Promise.all([
    getCachedPublicContent(),
    getCachedDirectRankingBoards().catch(() => []),
  ]);
  const githubToday = rankingBoards.find((board) => board.id === "github:today");
  const latestEvents = [...content.events].sort(compareEventsNewest);
  const frontierSeason = seasonForDate(new Date());
  const opcEntries = [
    {
      href: "/opc/infrastructure",
      code: `${infrastructureServices.length} INFRASTRUCTURES`,
      name: "基础设施",
      summary: "把跨领域经营能力建设成可运行的完整交付。",
    },
    {
      href: "/opc/specialties",
      code: `${specialtyServices.length} SPECIALTIES`,
      name: "专项服务",
      summary: "按六个专业领域解决一个边界清楚的问题。",
    },
    {
      href: "/opc/rangers",
      code: `${rangerProfiles.length} RANGER IDENTITIES`,
      name: "游骑兵协会",
      summary: "直接联系经基本核验的外部独立顾问。",
    },
  ];
  const updatedAt = content.state.updatedAt
    ? new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }).format(new Date(content.state.updatedAt))
    : content.state.mode === "degraded" ? "服务降级" : "更新中";

  return (
    <div className="home-stage shell">
      <header className="home-masthead">
        <div>
          <p className="home-signal">前方高能！</p>
          <h1>Vault2077</h1>
        </div>
        <p className="home-masthead__note">从信息、经营、进化到公开建造，为超级个体提供一套持续运行的坐标系统。</p>
      </header>

      <div className="home-waterfall">
        <section className="home-pane home-feed" aria-labelledby="home-feed-title">
          <header className="home-pane__header">
            <div>
              <p className="home-pane__meta mono">更新 {updatedAt} CST · {content.state.sourceCount} 个来源</p>
              <h2 id="home-feed-title">Vault 信息流</h2>
            </div>
            <Link className="home-pane__all mono" href="/feed">查看全部</Link>
          </header>
          <div className="home-feed__list">
            {latestEvents.slice(0, 3).map((event) => (
              <Link className="home-content-item home-feed__item" href={`/feed/${event.slug}`} key={event.slug}>
                <p className="home-item__meta mono">
                  <span>{eventCategory(event)}</span>
                  <time>{beijingTime(event.updated)}</time>
                </p>
                <h3>{event.title}</h3>
                <p className="home-item__summary">{eventJudgment(event)}</p>
              </Link>
            ))}
            {content.events.length === 0 ? (
              <p className="home-pane__empty">
                {content.state.mode === "degraded" ? "信息服务暂时不可用，请稍后重试。" : "信息采集中，稍后返回查看。"}
              </p>
            ) : null}
          </div>
        </section>

        <div className="home-side">
          <section className="home-pane home-sic" aria-labelledby="home-sic-title">
            <header className="home-pane__header">
              <div>
                <p className="home-pane__meta mono">GITHUB / OFFICIAL TODAY</p>
                <h2 id="home-sic-title">SiC 学院</h2>
              </div>
              <Link className="home-pane__all mono" href="/sic">查看全部</Link>
            </header>
            <div className="home-sic__list">
              {(githubToday?.items ?? []).slice(0, 3).map((project) => (
                <a className="home-content-item home-sic__item" href={project.itemUrl} target="_blank" rel="noreferrer" key={project.id}>
                  <p className="home-item__meta mono">
                    <span>#{String(project.providerRank).padStart(2, "0")} · TODAY</span>
                    <strong>{project.value === null ? "—" : `+${formatNumber(project.value)}`}</strong>
                  </p>
                  <h3>{project.name}</h3>
                  <p className="home-item__summary">{project.description || "GitHub 官方 Trending 项目。"}</p>
                </a>
              ))}
              {!githubToday?.items.length ? <p className="home-pane__empty">趋势数据更新中。</p> : null}
            </div>
          </section>

          <section className="home-pane home-opc" aria-labelledby="home-opc-title">
            <header className="home-pane__header">
              <div>
                <p className="home-pane__meta mono">FIXED SCOPE / FIXED PRICE</p>
                <h2 id="home-opc-title">OPC 服务台</h2>
              </div>
              <Link className="home-pane__all mono" href="/opc">查看全部</Link>
            </header>
            <div className="home-opc__list">
              {opcEntries.map((entry) => (
                <Link className="home-content-item home-opc__item" href={entry.href} key={entry.href}>
                  <p className="home-item__meta mono"><span>{entry.code}</span><strong>查看</strong></p>
                  <h3>{entry.name}</h3>
                  <p className="home-item__summary">{entry.summary}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="home-frontier" aria-labelledby="home-frontier-title">
        <div>
          <p className="home-frontier__meta mono">边境计划 · {frontierSeason.name}开放报名</p>
          <h2 id="home-frontier-title"><Link href="/frontier">跨越边境，荒野无垠。</Link></h2>
          <p>无期限 · 无评审 · 无组织 · 无目标</p>
        </div>
        <div className="home-frontier__action">
          <p className="mono">{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeZone: "Asia/Shanghai" }).format(new Date(frontierSeason.endsAt))} 结算</p>
          <Link href="/frontier/submit">参与计划</Link>
        </div>
      </section>
    </div>
  );
}
