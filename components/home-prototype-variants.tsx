import Link from "next/link";
import { HomeRefinedHero } from "./home-refined-hero";
import type { HomePrototypeVariant } from "./home-prototype-switcher";
import { HomePrototypeSwitcher } from "./home-prototype-switcher";

export type HomePrototypeEvent = {
  slug: string;
  category: string;
  time: string;
  title: string;
  judgment: string;
  evidenceCount: number;
};

export type HomePrototypeOpcEntry = {
  href: string;
  code: string;
  name: string;
  summary: string;
  responsibility: string;
};

export type HomePrototypeProject = {
  id: string;
  rank: number;
  value: string;
  name: string;
  description: string;
  href: string;
};

export type HomePrototypeData = {
  stateLabel: string;
  updatedAt: string;
  sourceCount: number;
  events: HomePrototypeEvent[];
  opcEntries: HomePrototypeOpcEntry[];
  sicLatest: {
    title: string;
    kind: string;
    source: string;
    date: string;
    href: string;
  } | null;
  projects: HomePrototypeProject[];
  frontier: {
    seasonName: string;
    settlementDate: string;
    updatedAt: string;
    rankings: Array<{ rank: number; repo: string; delta: string }>;
  };
};

type VariantProps = {
  data: HomePrototypeData;
  variant: HomePrototypeVariant;
  channel?: "vault" | "opc" | "sic" | "frontier";
};

const channels = [
  { id: "vault", code: "01 / INTEL", task: "核验变化", name: "Vault 信息流", note: "把公开变化压缩成可追溯事件。", href: "/feed" },
  { id: "opc", code: "02 / OPERATE", task: "建立经营结构", name: "OPC 服务台", note: "把跨领域能力组织成可运行交付。", href: "/opc" },
  { id: "sic", code: "03 / EVOLVE", task: "跟进能力边界", name: "SiC 学院", note: "从正式来源观察硅碳共生的进展。", href: "/sic" },
  { id: "frontier", code: "04 / BUILD", task: "推进公开建设", name: "边境计划", note: "用公开仓库记录持续发生的建设。", href: "/frontier" },
] as const;

function ChannelAction({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link className="home-prototype__action" href={href}>{children}<span aria-hidden="true">→</span></Link>;
}

function EventRows({ events, compact = false }: { events: HomePrototypeEvent[]; compact?: boolean }) {
  if (events.length === 0) return <p className="home-prototype__empty">当前没有可发布事件，请稍后返回。</p>;
  return (
    <div className={compact ? "home-prototype-events is-compact" : "home-prototype-events"}>
      {events.map((event) => (
        <Link href={`/feed/${event.slug}`} className="home-prototype-event" key={event.slug}>
          <p className="mono">
            <span>{event.category} · {event.time}</span>
            <span>{event.evidenceCount} 项依据</span>
          </p>
          <h3>{event.title}</h3>
          <span>{event.judgment}</span>
        </Link>
      ))}
    </div>
  );
}

function OpcRows({ entries }: { entries: HomePrototypeOpcEntry[] }) {
  return (
    <div className="home-prototype-opc">
      {entries.map((entry, index) => (
        <Link href={entry.href} key={entry.href}>
          <span className="mono">{String(index + 1).padStart(2, "0")}</span>
          <div><h3>{entry.name}</h3><p>{entry.summary}</p></div>
          <div><strong>{entry.responsibility}</strong><small className="mono">{entry.code}</small></div>
          <i aria-hidden="true">→</i>
        </Link>
      ))}
    </div>
  );
}

function SicPreview({ data }: { data: HomePrototypeData }) {
  return (
    <div className="home-prototype-sic">
      <section>
        <p className="mono">LATEST FORMAL CONTENT / 最新正式内容</p>
        {data.sicLatest ? (
          <a href={data.sicLatest.href} target="_blank" rel="noreferrer">
            <span>{data.sicLatest.kind} · {data.sicLatest.source} · {data.sicLatest.date}</span>
            <h3>{data.sicLatest.title}</h3>
            <strong>查看原始内容 ↗</strong>
          </a>
        ) : <p className="home-prototype__empty">正式内容正在编排。</p>}
      </section>
      <section>
        <p className="mono">GITHUB / PLATFORM NATIVE</p>
        {data.projects.length ? data.projects.map((project) => (
          <a href={project.href} target="_blank" rel="noreferrer" key={project.id}>
            <span className="mono">#{String(project.rank).padStart(2, "0")}</span>
            <h3>{project.name}</h3>
            <strong>{project.value}</strong>
          </a>
        )) : <p className="home-prototype__empty">平台原生榜暂不可用。</p>}
      </section>
    </div>
  );
}

function FrontierPreview({ data, dark = false }: { data: HomePrototypeData; dark?: boolean }) {
  return (
    <div className={dark ? "home-prototype-frontier is-dark" : "home-prototype-frontier"}>
      <header>
        <div>
          <p className="mono">{data.frontier.seasonName} · {data.frontier.updatedAt}</p>
          <h2>下一件作品，公开建造。</h2>
          <p>无期限 · 无评审 · 无组织 · 无目标</p>
        </div>
        <p className="mono">{data.frontier.settlementDate} 结算</p>
      </header>
      <div className="home-prototype-frontier__ranking">
        {data.frontier.rankings.length ? data.frontier.rankings.map((entry) => (
          <Link href="/frontier/ranking" key={`${entry.rank}-${entry.repo}`}>
            <span className="mono">#{String(entry.rank).padStart(2, "0")}</span>
            <strong>{entry.repo}</strong>
            <span>{entry.delta}</span>
          </Link>
        )) : <p>本赛季尚无通过验证的项目。</p>}
      </div>
      <div className="home-prototype-frontier__actions">
        <Link href="/frontier/ranking">查看当前排名</Link>
        <Link href="/frontier/submit">参加本赛季</Link>
      </div>
    </div>
  );
}

function VariantAxis({ data }: { data: HomePrototypeData }) {
  return (
    <div className="home-prototype home-prototype--axis">
      <header className="home-prototype-axis__hero shell">
        <p className="mono">VAULT2077 / PUBLIC OPERATING REGISTER</p>
        <div>
          <h1>超级个体的<br />四条长期运行轴。</h1>
          <p>从信息、经营、进化到公开建造，把一人公司的长期任务组织为一套可以持续进入、核验和行动的公共坐标。</p>
        </div>
      </header>

      <nav className="home-prototype-axis__grid" aria-label="Vault2077 四条运行轴">
        {channels.map((channel) => (
          <Link href={channel.href} key={channel.id}>
            <span className="mono">{channel.code}</span>
            <div><p>{channel.task}</p><h2>{channel.name}</h2></div>
            <p>{channel.note}</p>
            <strong>进入频道 →</strong>
          </Link>
        ))}
      </nav>

      <section className="home-prototype-axis__register shell" aria-labelledby="axis-register-title">
        <header>
          <div><p className="mono">CURRENT INDEX / 当前索引</p><h2 id="axis-register-title">今天，从哪一轴进入？</h2></div>
          <p>所有状态以最近一次成功记录为准；无真实内容时保留明确空状态。</p>
        </header>

        <article className="home-prototype-axis__record">
          <div className="home-prototype-axis__identity"><span className="mono">01 / INTEL</span><h2>Vault 信息流</h2><p>{data.updatedAt} · {data.sourceCount} 个来源 · {data.stateLabel}</p></div>
          <EventRows events={data.events.slice(0, 2)} compact />
          <ChannelAction href="/feed">进入事件簿</ChannelAction>
        </article>

        <article className="home-prototype-axis__record">
          <div className="home-prototype-axis__identity"><span className="mono">02 / OPERATE</span><h2>OPC 服务台</h2><p>两种责任主体，三个清晰入口。</p></div>
          <OpcRows entries={data.opcEntries} />
          <ChannelAction href="/opc">查看服务目录</ChannelAction>
        </article>

        <article className="home-prototype-axis__record">
          <div className="home-prototype-axis__identity"><span className="mono">03 / EVOLVE</span><h2>SiC 学院</h2><p>正式内容与平台原生榜分开呈现。</p></div>
          <SicPreview data={data} />
          <ChannelAction href="/sic">进入学院</ChannelAction>
        </article>

        <article className="home-prototype-axis__record">
          <div className="home-prototype-axis__identity"><span className="mono">04 / BUILD</span><h2>边境计划</h2><p>{data.frontier.seasonName} · 全赛季开放报名</p></div>
          <FrontierPreview data={data} />
        </article>
      </section>
    </div>
  );
}

function VariantSequence({ data }: { data: HomePrototypeData }) {
  return (
    <div className="home-prototype home-prototype--sequence">
      <header className="home-prototype-sequence__cover shell">
        <div>
          <p className="mono">VAULT2077 / TODAY&apos;S OPERATING FOLIO</p>
          <h1>今天，<br />从一个问题开始。</h1>
          <p>为超级个体签发的一份公共操作卷：先判断变化，再处理经营，跟进能力，最后推进公开建设。</p>
        </div>
        <nav aria-label="今日操作卷目录">
          {channels.map((channel) => (
            <a href={`#sequence-${channel.id}`} key={channel.id}>
              <span className="mono">{channel.code}</span>
              <strong>{channel.task}？</strong>
              <span>{channel.name} ↓</span>
            </a>
          ))}
        </nav>
      </header>

      <div className="home-prototype-sequence__body shell">
        <aside aria-label="操作卷章节">
          <p className="mono">OPERATING FOLIO</p>
          {channels.map((channel) => <a href={`#sequence-${channel.id}`} key={channel.id}><span>{channel.code.slice(0, 2)}</span>{channel.task}</a>)}
        </aside>
        <div className="home-prototype-sequence__chapters">
          <section id="sequence-vault" className="home-prototype-sequence__chapter">
            <header><p className="mono">01 / VAULT 信息流 · {data.updatedAt} · {data.stateLabel}</p><h2>发生了什么变化？</h2><ChannelAction href="/feed">查看全部事件</ChannelAction></header>
            <EventRows events={data.events} />
          </section>

          <section id="sequence-opc" className="home-prototype-sequence__chapter">
            <header><p className="mono">02 / OPC 服务台</p><h2>现在必须处理什么？</h2><ChannelAction href="/opc">查看服务台</ChannelAction></header>
            <OpcRows entries={data.opcEntries} />
          </section>

          <section id="sequence-sic" className="home-prototype-sequence__chapter">
            <header><p className="mono">03 / SiC 学院</p><h2>下一项能力跟什么？</h2><ChannelAction href="/sic">查看学院</ChannelAction></header>
            <SicPreview data={data} />
          </section>
        </div>
      </div>
      <section id="sequence-frontier" className="home-prototype-sequence__final">
        <div className="shell"><p className="mono">04 / FRONTIER · 公开建造</p><FrontierPreview data={data} dark /></div>
      </section>
    </div>
  );
}

function InstrumentReading({ channel, data }: { channel: NonNullable<VariantProps["channel"]>; data: HomePrototypeData }) {
  if (channel === "vault") return <><header><p className="mono">CURRENT READING / 01</p><h1>Vault 信息流</h1><p>把变化压缩成可核验的事件。</p></header><EventRows events={data.events} /><ChannelAction href="/feed">查看全部事件</ChannelAction></>;
  if (channel === "opc") return <><header><p className="mono">CURRENT READING / 02</p><h1>OPC 服务台</h1><p>先确认责任主体，再进入服务目录。</p></header><OpcRows entries={data.opcEntries} /><ChannelAction href="/opc">查看服务目录</ChannelAction></>;
  if (channel === "sic") return <><header><p className="mono">CURRENT READING / 03</p><h1>SiC 学院</h1><p>正式内容与平台原生榜各守其位。</p></header><SicPreview data={data} /><ChannelAction href="/sic">进入学院</ChannelAction></>;
  return <><header><p className="mono">CURRENT READING / 04</p><h1>边境计划</h1><p>把真实发生的公开建设记录下来。</p></header><FrontierPreview data={data} /></>;
}

function VariantInstrument({ data, selected }: { data: HomePrototypeData; selected: NonNullable<VariantProps["channel"]> }) {
  const status = {
    vault: `${data.updatedAt} · ${data.sourceCount} 个来源`,
    opc: `${data.opcEntries.length} 类入口 · 两种责任`,
    sic: data.sicLatest ? `最新内容 · ${data.sicLatest.date}` : "正式内容编排中",
    frontier: `${data.frontier.seasonName} · ${data.frontier.updatedAt}`,
  } as const;

  return (
    <div className="home-prototype home-prototype--instrument">
      <header className="home-prototype-instrument__masthead shell">
        <div><p className="mono">VAULT2077 / COORDINATE REGISTER</p><h1>选择一条坐标，<br />读取当前状态。</h1></div>
        <p>同一个公共索引，四种长期任务。选择不会隐藏其他频道，也不会把近似实时伪装成实时。</p>
      </header>
      <section className="home-prototype-instrument__frame" aria-label="Vault2077 坐标总表">
        <nav aria-label="选择运行坐标">
          {channels.map((channel) => {
            const active = selected === channel.id;
            return (
              <Link
                className={active ? "is-active" : ""}
                href={`/?variant=instrument&channel=${channel.id}`}
                aria-current={active ? "page" : undefined}
                key={channel.id}
              >
                <span className="mono">{channel.code}</span>
                <div><strong>{channel.name}</strong><small>{status[channel.id]}</small></div>
                <i>{active ? "当前" : "选择"} →</i>
              </Link>
            );
          })}
        </nav>
        <article id="instrument-reading" className="home-prototype-instrument__reading">
          <InstrumentReading channel={selected} data={data} />
        </article>
      </section>
      <section className="home-prototype-instrument__ledger shell" aria-label="OPC 责任登记">
        <header><p className="mono">RESPONSIBILITY REGISTER / OPC</p><h2>先确认谁负责。</h2></header>
        <div><strong>Vault2077 直接交付</strong><p>基础设施 / 专项服务。先确认适用性，再安排付款与交付。</p></div>
        <div><strong>外部独立顾问</strong><p>游骑兵由用户直接联系；Vault2077 不参与后续定价、付款、交付或争议。</p></div>
      </section>
    </div>
  );
}

function VariantRefined({ data }: { data: HomePrototypeData }) {
  const leadEvent = data.events[0];
  const secondaryEvents = data.events.slice(1);
  const leadingProject = data.projects[0];
  const remainingProjects = data.projects.slice(1);
  const leadingFrontierEntry = data.frontier.rankings[0];

  return (
    <div className="home-prototype home-prototype--refined">
      <div className="home-refined shell">
        <HomeRefinedHero />

        <div className="home-refined__waterfall">
          <section className="home-refined-card home-refined-feed" aria-labelledby="refined-feed-title">
            <header className="home-refined-card__header">
              <div>
                <p className="mono">{data.updatedAt} · {data.sourceCount} 个来源 · {data.stateLabel}</p>
                <h2 id="refined-feed-title">Vault 信息流</h2>
              </div>
              <Link href="/feed">进入事件簿 →</Link>
            </header>

            {leadEvent ? (
              <Link className="home-refined-feed__lead" href={`/feed/${leadEvent.slug}`}>
                <p className="mono"><span>{leadEvent.category} · {leadEvent.time}</span><strong>{leadEvent.evidenceCount} 项依据</strong></p>
                <h3>{leadEvent.title}</h3>
                <span>{leadEvent.judgment}</span>
              </Link>
            ) : <p className="home-prototype__empty">当前没有可发布事件，请稍后返回。</p>}

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
            <section className="home-refined-card home-refined-opc" aria-labelledby="refined-opc-title">
              <header className="home-refined-card__header">
                <div>
                  <p className="mono">DELIVERY / RESPONSIBILITY REGISTER</p>
                  <h2 id="refined-opc-title">OPC 服务台</h2>
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
              <p className="home-refined-opc__boundary">基础设施与专项服务由 Vault2077 直接交付；游骑兵由用户直接联系，双方自行约定后续事项。</p>
            </section>

            <section className="home-refined-card home-refined-sic" aria-labelledby="refined-sic-title">
              <header className="home-refined-card__header">
                <div>
                  <p className="mono">FORMAL CONTENT / PLATFORM NATIVE</p>
                  <h2 id="refined-sic-title">SiC 学院</h2>
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
                  ) : <p className="home-prototype__empty">正式内容正在编排。</p>}
                </section>
                <section>
                  <p className="mono">GITHUB / OFFICIAL TODAY</p>
                  {leadingProject ? (
                    <a className="home-refined-sic__lead-project" href={leadingProject.href} target="_blank" rel="noreferrer">
                      <span className="mono">#{String(leadingProject.rank).padStart(2, "0")} · {leadingProject.value}</span>
                      <h3>{leadingProject.name} ↗</h3>
                      <p>{leadingProject.description}</p>
                    </a>
                  ) : <p className="home-prototype__empty">平台原生榜暂不可用。</p>}
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

        <section className="home-refined-frontier" aria-labelledby="refined-frontier-title">
          <div>
            <p className="mono">边境计划 · {data.frontier.seasonName}</p>
            <h2 id="refined-frontier-title"><Link href="/frontier">跨越边境，荒野无垠。</Link></h2>
            <p>无期限 · 无评审 · 无组织 · 无目标</p>
          </div>
          <div className="home-refined-frontier__status">
            <p className="mono">CURRENT SEASON / {data.frontier.updatedAt}</p>
            {leadingFrontierEntry ? (
              <Link href="/frontier/ranking"><span>当前 #01</span><strong>{leadingFrontierEntry.repo}</strong><small>{leadingFrontierEntry.delta}</small></Link>
            ) : <p>本赛季尚无通过验证的项目。</p>}
          </div>
          <div className="home-refined-frontier__action">
            <p className="mono">{data.frontier.settlementDate} 结算</p>
            <Link href="/frontier/submit">参与计划</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

export function HomePrototype({ data, variant, channel = "vault" }: VariantProps) {
  return (
    <>
      {variant === "axis" ? <VariantAxis data={data} /> : null}
      {variant === "sequence" ? <VariantSequence data={data} /> : null}
      {variant === "instrument" ? <VariantInstrument data={data} selected={channel} /> : null}
      {variant === "refined" ? <VariantRefined data={data} /> : null}
      <HomePrototypeSwitcher current={variant} />
    </>
  );
}
