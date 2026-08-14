import Link from "next/link";
import { HomeRefinedHero } from "./home-refined-hero";

export type HomeExperienceData = {
  stateLabel: string;
  updatedAt: string;
  sourceCount: number;
  unavailable: {
    feed: boolean;
    opc: boolean;
    sic: boolean;
    rankings: boolean;
    frontierRanking: boolean;
    frontierLaunch: boolean;
  };
  events: Array<{
    slug: string;
    category: string;
    time: string;
    title: string;
    judgment: string;
    evidenceCount: number;
  }>;
  opcEntries: Array<{
    href: string;
    code: string;
    name: string;
    summary: string;
    responsibility: string;
  }>;
  sicLatest: {
    title: string;
    kind: string;
    source: string;
    date: string;
    href: string;
  } | null;
  projects: Array<{
    id: string;
    rank: number;
    value: string;
    name: string;
    description: string;
    href: string;
  }>;
  frontier: {
    writesEnabled: boolean;
    seasonName: string;
    settlementDate: string;
    updatedAt: string;
    rankings: Array<{ rank: number; repo: string; delta: string }>;
  };
};

export function HomeExperience({ data }: { data: HomeExperienceData }) {
  const leadEvent = data.events[0];
  const secondaryEvents = data.events.slice(1);
  const leadingProject = data.projects[0];
  const remainingProjects = data.projects.slice(1);
  const leadingFrontierEntry = data.frontier.rankings[0];

  return (
    <div className="home-experience">
      <div className="home-refined shell">
        <HomeRefinedHero />

        <nav className="home-mobile-status" aria-label="四频道当前状态">
          <Link href={leadEvent ? `/feed/${leadEvent.slug}` : "/feed"}>
            <span className="mono">INTEL / {data.updatedAt}</span>
            <strong>Vault 信息流</strong>
            <small>{leadEvent ? leadEvent.title : data.unavailable.feed ? "信息流暂时无法更新" : "等待下一次事件发布"}</small>
            <i aria-hidden="true">→</i>
          </Link>
          <Link href="/opc">
            <span className="mono">OPERATE / {String(data.opcEntries.length).padStart(2, "0")} ENTRIES</span>
            <strong>OPC 服务台</strong>
            <small>{data.unavailable.opc ? "服务目录暂时无法更新" : "选择标准服务或联系独立顾问"}</small>
            <i aria-hidden="true">→</i>
          </Link>
          <Link href="/sic">
            <span className="mono">EVOLVE / {data.sicLatest?.date ?? "PENDING"}</span>
            <strong>SiC 学院</strong>
            <small>{data.sicLatest ? `${data.sicLatest.kind} · ${data.sicLatest.title}` : data.unavailable.sic ? "学院内容暂时无法更新" : "正式内容正在编排"}</small>
            <i aria-hidden="true">→</i>
          </Link>
          <Link href={data.frontier.writesEnabled ? "/frontier/submit" : "/frontier"}>
            <span className="mono">BUILD / {data.frontier.seasonName}</span>
            <strong>边境计划</strong>
            <small>{data.frontier.settlementDate} 结算 · {data.unavailable.frontierLaunch ? "开放状态暂时无法确认" : data.frontier.writesEnabled ? "参加本赛季" : "报名准备中"}</small>
            <i aria-hidden="true">→</i>
          </Link>
        </nav>

        <div className="home-refined__waterfall">
          <section className="home-refined-card home-refined-feed" aria-labelledby="home-feed-title">
            <header className="home-refined-card__header">
              <div>
                <p className="mono">{data.updatedAt} · {data.sourceCount} 个来源 · {data.stateLabel}</p>
                <h2 id="home-feed-title">Vault 信息流</h2>
              </div>
              <Link href="/feed">进入事件簿 →</Link>
            </header>

            {leadEvent ? (
              <Link className="home-refined-feed__lead" href={`/feed/${leadEvent.slug}`}>
                <p className="mono"><span>{leadEvent.category} · {leadEvent.time}</span><strong>{leadEvent.evidenceCount} 项依据</strong></p>
                <h3>{leadEvent.title}</h3>
                <span>{leadEvent.judgment}</span>
              </Link>
            ) : <p className="home-experience__empty">{data.unavailable.feed ? "信息流读取失败；请稍后重试。" : "当前没有可发布事件，请稍后返回。"}</p>}

            <div className="home-refined-feed__secondary">
              {secondaryEvents.map((event) => (
                <Link href={`/feed/${event.slug}`} key={event.slug}>
                  <p className="mono"><span>{event.category}</span><time>{event.time}</time></p>
                  <h3>{event.title}</h3>
                  <div><span>{event.judgment}</span><strong>{event.evidenceCount} 项依据</strong></div>
                </Link>
              ))}
            </div>

            <footer className="home-refined-feed__footer">
              <p>每个事件都可以回到组成资讯与原始来源。</p>
              <Link href="/sources">查看数据源地图 →</Link>
            </footer>
          </section>

          <div className="home-refined__side">
            <section className="home-refined-card home-refined-opc" aria-labelledby="home-opc-title">
              <header className="home-refined-card__header">
                <div>
                  <p className="mono">DELIVERY / RESPONSIBILITY REGISTER</p>
                  <h2 id="home-opc-title">OPC 服务台</h2>
                </div>
                <Link href="/opc">查看服务目录 →</Link>
              </header>
              <div className="home-refined-opc__rows">
                {data.opcEntries.map((entry, index) => (
                  <Link href={entry.href} key={entry.href}>
                    <span className="mono">{String(index + 1).padStart(2, "0")}</span>
                    <div><h3>{entry.name}</h3><p>{entry.summary}</p></div>
                    <div><strong>{entry.responsibility}</strong><small className="mono">{entry.code}</small></div>
                    <i aria-hidden="true">→</i>
                  </Link>
                ))}
              </div>
              {data.unavailable.opc ? <p className="home-experience__empty" role="status">服务目录读取失败；当前计数不可用，请进入服务台稍后重试。</p> : null}
              <p className="home-refined-opc__boundary">基础设施与专项服务由 Vault2077 直接交付；游骑兵由用户直接联系，双方自行约定后续事项。</p>
            </section>

            <section className="home-refined-card home-refined-sic" aria-labelledby="home-sic-title">
              <header className="home-refined-card__header">
                <div>
                  <p className="mono">FORMAL CONTENT / PLATFORM NATIVE</p>
                  <h2 id="home-sic-title">SiC 学院</h2>
                </div>
                <Link href="/sic">进入学院 →</Link>
              </header>
              <div className="home-refined-sic__content">
                <section>
                  <p className="mono">最新正式内容</p>
                  {data.sicLatest ? (
                    <a href={data.sicLatest.href} target="_blank" rel="noreferrer">
                      <span>{data.sicLatest.kind} · {data.sicLatest.source} · {data.sicLatest.date}</span>
                      <h3>{data.sicLatest.title}</h3>
                      <strong>查看原始内容 ↗</strong>
                    </a>
                  ) : <p className="home-experience__empty">{data.unavailable.sic ? "学院内容读取失败；请稍后重试。" : "正式内容正在编排。"}</p>}
                </section>
                <section>
                  <p className="mono">CODE REPOSITORY / TODAY</p>
                  {leadingProject ? (
                    <a className="home-refined-sic__lead-project" href={leadingProject.href} target="_blank" rel="noreferrer">
                      <span className="mono">#{String(leadingProject.rank).padStart(2, "0")} · {leadingProject.value}</span>
                      <h3>{leadingProject.name} ↗</h3>
                      <p>{leadingProject.description}</p>
                    </a>
                  ) : <p className="home-experience__empty">{data.unavailable.rankings ? "平台原生榜读取失败；请稍后重试。" : "当前没有平台原生榜数据。"}</p>}
                  {remainingProjects.map((project) => (
                    <a className="home-refined-sic__project" href={project.href} target="_blank" rel="noreferrer" key={project.id}>
                      <span className="mono">#{String(project.rank).padStart(2, "0")}</span>
                      <strong>{project.name} ↗</strong>
                      <span>{project.value}</span>
                    </a>
                  ))}
                </section>
              </div>
            </section>
          </div>
        </div>

        <section className="home-refined-frontier" aria-labelledby="home-frontier-title">
          <div>
            <p className="mono">边境计划 · {data.frontier.seasonName}</p>
            <h2 id="home-frontier-title"><Link href="/frontier">跨越边境，荒野无垠。</Link></h2>
            <p>无组织 · 无纪律 · 无目标 · 无期限</p>
          </div>
          <div className="home-refined-frontier__status">
            <p className="mono">CURRENT SEASON / {data.frontier.updatedAt}</p>
            {leadingFrontierEntry ? (
              <Link href="/frontier/ranking"><span>当前 #01</span><strong>{leadingFrontierEntry.repo}</strong><small>{leadingFrontierEntry.delta}</small></Link>
            ) : <p>{data.unavailable.frontierRanking ? "赛季榜单暂时无法更新。" : "本赛季尚无通过验证的项目。"}</p>}
          </div>
          <div className="home-refined-frontier__action">
            <p className="mono">{data.frontier.settlementDate} 结算</p>
            <Link href={data.frontier.writesEnabled ? "/frontier/submit" : "/frontier"}>{data.frontier.writesEnabled ? "参与计划" : "查看开放状态"}</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
