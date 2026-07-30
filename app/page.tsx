import Link from "next/link";
import {
  HomePrototype,
  type HomePrototypeData,
} from "@/components/home-prototype-variants";
import type { HomePrototypeVariant } from "@/components/home-prototype-switcher";
import { formatNumber } from "@/lib/data";
import { beijingTime, compareEventsNewest, eventCategory, eventJudgment } from "@/lib/feed-format";
import { seasonForDate } from "@/lib/frontier-domain";
import { infrastructureServices, rangerProfiles, specialtyServices } from "@/lib/opc-catalog";
import {
  getCachedDirectRankingBoards,
  getCachedFrontierRanking,
  getCachedPublicContent,
  getCachedSicContent,
} from "@/lib/public-read-cache";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<{
    variant?: string;
    channel?: string;
  }>;
};

function prototypeVariant(value: string | undefined): HomePrototypeVariant | null {
  if (value === "axis" || value === "sequence" || value === "instrument" || value === "refined") return value;
  return null;
}

function instrumentChannel(value: string | undefined) {
  if (value === "opc" || value === "sic" || value === "frontier") return value;
  return "vault";
}

function compactDate(value: string | null | undefined) {
  if (!value) return "时间未注明";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function compactDateTime(value: string | null | undefined) {
  if (!value) return "等待首次更新";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const parameters = await searchParams;
  const selectedVariant = process.env.NODE_ENV === "production"
    ? "refined"
    : parameters.variant === "original"
      ? null
      : prototypeVariant(parameters.variant) ?? "refined";
  const frontierSeason = seasonForDate(new Date());
  const [content, rankingBoards] = await Promise.all([
    getCachedPublicContent(),
    getCachedDirectRankingBoards().catch(() => []),
  ]);
  const [sicContent, frontierRanking] = selectedVariant
    ? await Promise.all([
        getCachedSicContent().catch(() => null),
        getCachedFrontierRanking(frontierSeason.code).catch(() => ({ rankings: [], updatedAt: null })),
      ])
    : [null, null];
  const githubToday = rankingBoards.find((board) => board.id === "github:today");
  const latestEvents = [...content.events].sort(compareEventsNewest);
  const opcEntries = [
    {
      href: "/opc?view=infrastructure",
      code: `${infrastructureServices.length} INFRASTRUCTURES`,
      name: "基础设施",
      summary: "把跨领域经营能力建设成可运行的完整交付。",
    },
    {
      href: "/opc?view=specialties",
      code: `${specialtyServices.length} SPECIALTIES`,
      name: "专项服务",
      summary: "按六个专业领域解决一个边界清楚的问题。",
    },
    {
      href: "/opc?view=rangers",
      code: `${rangerProfiles.length} RANGER IDENTITIES`,
      name: "游骑兵协会",
      summary: "直接联系经基本核验的外部独立顾问。",
    },
  ];
  const updatedAt = content.state.updatedAt
    ? new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }).format(new Date(content.state.updatedAt))
    : content.state.mode === "degraded" ? "服务降级" : "更新中";

  if (selectedVariant) {
    const sicItems = sicContent
      ? Object.values(sicContent.groups).flat().sort((left, right) => {
          const leftTime = left.publishedAt ?? left.collectedAt;
          const rightTime = right.publishedAt ?? right.collectedAt;
          return rightTime.localeCompare(leftTime);
        })
      : [];
    const latestSicItem = sicItems[0] ?? null;
    const kindLabel = {
      papers: "论文",
      documents: "档案",
      courses: "课程",
      podcasts: "播客",
    } as const;
    const prototypeData: HomePrototypeData = {
      stateLabel: content.state.mode === "live"
        ? "最近一次成功发布"
        : content.state.mode === "degraded" ? "服务降级" : "本地预览",
      updatedAt: content.state.updatedAt ? `${compactDateTime(content.state.updatedAt)} CST` : updatedAt,
      sourceCount: content.state.sourceCount,
      events: latestEvents.slice(0, 3).map((event) => ({
        slug: event.slug,
        category: eventCategory(event),
        time: beijingTime(event.updated),
        title: event.title,
        judgment: eventJudgment(event),
        evidenceCount: event.sources?.length ?? 0,
      })),
      opcEntries: opcEntries.map((entry, index) => ({
        ...entry,
        responsibility: index < 2
          ? "Vault2077 直接交付 · 先确认适用性"
          : "外部独立顾问 · 用户直接联系",
      })),
      sicLatest: latestSicItem ? {
        title: latestSicItem.translatedTitle || latestSicItem.title,
        kind: kindLabel[latestSicItem.group],
        source: latestSicItem.publisher || latestSicItem.sourceName,
        date: compactDate(latestSicItem.publishedAt ?? latestSicItem.collectedAt),
        href: latestSicItem.url,
      } : null,
      projects: (githubToday?.items ?? []).slice(0, 3).map((project) => ({
        id: project.id,
        rank: project.providerRank,
        value: project.value === null ? "—" : `+${formatNumber(project.value)}`,
        name: project.name,
        description: project.description || "代码托管平台当日趋势项目。",
        href: project.itemUrl,
      })),
      frontier: {
        seasonName: frontierSeason.name,
        settlementDate: new Intl.DateTimeFormat("zh-CN", {
          dateStyle: "medium",
          timeZone: "Asia/Shanghai",
        }).format(new Date(frontierSeason.endsAt)),
        updatedAt: compactDateTime(frontierRanking?.updatedAt),
        rankings: (frontierRanking?.rankings ?? []).slice(0, 3).map((entry) => ({
          rank: entry.rank,
          repo: entry.repo,
          delta: `净增 ${entry.delta >= 0 ? "+" : ""}${formatNumber(entry.delta)} Star`,
        })),
      },
    };
    return (
      <HomePrototype
        data={prototypeData}
        variant={selectedVariant}
        channel={instrumentChannel(parameters.channel)}
      />
    );
  }

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
              <p className="home-pane__meta mono">
                {content.state.updatedAt ? `更新 ${updatedAt} CST` : updatedAt} · {content.state.sourceCount} 个来源
              </p>
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
                <p className="home-pane__meta mono">CODE REPOSITORY / TODAY</p>
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
                  <p className="home-item__summary">{project.description || "代码托管平台当日趋势项目。"}</p>
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
