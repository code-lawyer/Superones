import Link from "next/link";
import { formatNumber, services, siteStatus } from "@/lib/data";
import { beijingTime, compareEventsNewest, eventCategory, eventJudgment } from "@/lib/feed-format";
import { getPublicContent } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const content = await getPublicContent();
  const latestEvents = [...content.events].sort(compareEventsNewest);
  const updatedAt = content.state.updatedAt
    ? new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }).format(new Date(content.state.updatedAt))
    : "更新中";

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
            {content.events.length === 0 ? <p className="home-pane__empty">信息采集中，稍后返回查看。</p> : null}
          </div>
        </section>

        <div className="home-side">
          <section className="home-pane home-sic" aria-labelledby="home-sic-title">
            <header className="home-pane__header">
              <div>
                <p className="home-pane__meta mono">24H GITHUB VELOCITY</p>
                <h2 id="home-sic-title">SiC 学院</h2>
              </div>
              <Link className="home-pane__all mono" href="/sic">查看全部</Link>
            </header>
            <div className="home-sic__list">
              {content.projects.slice(0, 3).map((project) => (
                <Link className="home-content-item home-sic__item" href={`/sic/${project.owner}/${project.repo}`} key={`${project.owner}/${project.repo}`}>
                  <p className="home-item__meta mono">
                    <span>#{String(project.rank).padStart(2, "0")} · {project.category}</span>
                    <strong>+{formatNumber(project.delta24)}</strong>
                  </p>
                  <h3>{project.owner}/{project.repo}</h3>
                  <p className="home-item__summary">{project.description}</p>
                </Link>
              ))}
              {content.projects.length === 0 ? <p className="home-pane__empty">趋势数据更新中。</p> : null}
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
              {services.slice(0, 2).map((service) => (
                <Link className="home-content-item home-opc__item" href={`/opc/${service.slug}`} key={service.slug}>
                  <p className="home-item__meta mono"><span>{service.category} · {service.period}</span><strong>{service.price}</strong></p>
                  <h3>{service.name}</h3>
                  <p className="home-item__summary">{service.audience}</p>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="home-frontier" aria-labelledby="home-frontier-title">
        <div>
          <p className="home-frontier__meta mono">边境计划 · 2026 夏季赛开放报名</p>
          <h2 id="home-frontier-title"><Link href="/frontier">跨越边境，荒野无垠。</Link></h2>
          <p>无评审 · 零限制 · 全天候 · 非实名</p>
        </div>
        <div className="home-frontier__action">
          <p className="mono">{siteStatus.settlement} 结算</p>
          <Link href="/frontier/submit">参与计划</Link>
        </div>
      </section>
    </div>
  );
}
