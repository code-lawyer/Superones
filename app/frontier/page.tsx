import type { Metadata } from "next";
import Link from "next/link";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { FrontierRanking } from "@/components/frontier-ranking";
import { PageIntro } from "@/components/page-intro";
import { beijingSeasonDate, seasonFromCode } from "@/lib/frontier-domain";
import {
  OFFICIAL_CHAMPION_REWARD,
  currentSeason,
  latestRankingUpdate,
  listPublicPrizePool,
  listPublicRankings,
  listSeasonHistory,
} from "@/lib/frontier-store";
import { ManifestoContent, RulesContent } from "./frontier-copy";
import { FrontierDialog } from "./frontier-dialog";
import { FrontierPrinciples } from "./frontier-principles";

export const metadata: Metadata = { title: "边境计划" };
export const dynamic = "force-dynamic";

function displayTime(value: string | null) {
  if (!value) return "等待首次更新";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export default async function FrontierPage() {
  const season = currentSeason();
  const [seasonYear, seasonLabel] = season.name.split(" ");
  const [rankings, updatedAt, prizes, history] = await Promise.all([
    listPublicRankings(season.code),
    latestRankingUpdate(season.code),
    listPublicPrizePool(season.code),
    listSeasonHistory(),
  ]);

  return (
    <div className="frontier-landing">
      <PageIntro
        code="FRONTIER / PERPETUAL HACKATHON"
        title="无垠荒野，永不落幕"
        lead="提交一件你真正想做的事。没有赛道，没有评委，也没有人替你决定它是否值得。"
        meta={`${season.name} / 全赛季开放报名 / ${beijingSeasonDate(season.endsAt)} 结算`}
      />
      <ChannelRibbon identity="THE FRONTIER" slogan="HERE, YOU MAY PASS." />

      <section className="frontier-doctrine" aria-label="边境计划宣言与四无原则">
        <div className="shell frontier-doctrine__columns">
          <article className="frontier-manifesto-column" aria-label="边境计划宣言">
            <p className="eyebrow mono frontier-manifesto-column__label">FRONTIER MANIFESTO / 宣言</p>
            <ManifestoContent />
          </article>
          <FrontierPrinciples />
        </div>
      </section>

      <section className="shell frontier-live" aria-labelledby="frontier-live-title">
        <header className="frontier-live__header">
          <div>
            <p className="eyebrow mono">CURRENT SEASON / LIVE</p>
            <h2 id="frontier-live-title">这一季，正在发生。</h2>
          </div>
          <p>从验证通过的那一刻起，只计算真实发生的变化。没有评审席，排行榜就是公共记录。</p>
        </header>

        <div className="frontier-live__grid">
          <section className="frontier-season-card" aria-label={`${season.name}赛季状态`}>
            <div className="frontier-season-card__mark">
              <span className="mono">{seasonYear}</span>
              <strong>{seasonLabel}</strong>
            </div>
            <dl className="frontier-season-card__facts">
              <div><dt className="mono">报名</dt><dd>全赛季开放</dd></div>
              <div><dt className="mono">排名</dt><dd>净新增 Star</dd></div>
              <div><dt className="mono">更新</dt><dd>每小时一次</dd></div>
              <div><dt className="mono">结算</dt><dd>{beijingSeasonDate(season.endsAt)}</dd></div>
            </dl>
            <div className="frontier-season-card__actions">
              <Link className="frontier-primary-action" href="/frontier/submit">参加本赛季 <span aria-hidden="true">↗</span></Link>
              <FrontierDialog trigger="查看参赛规则" title="边境计划参赛规则" eyebrow="FRONTIER / RULES" triggerClassName="frontier-secondary-action"><RulesContent /></FrontierDialog>
            </div>
          </section>

          <section className="frontier-ranking-panel" aria-labelledby="frontier-ranking-title">
            <header className="frontier-ranking-panel__header">
              <div>
                <p className="mono">LIVE RANKING</p>
                <h3 id="frontier-ranking-title">当前排名</h3>
              </div>
              <div>
                <span className="mono">UPDATED {displayTime(updatedAt)}</span>
                <Link href="/frontier/ranking">查看完整榜单 ↗</Link>
              </div>
            </header>
            <FrontierRanking items={rankings.slice(0, 5)} variant="feature" />
          </section>
        </div>
      </section>

      <section className="frontier-rewards" aria-labelledby="frontier-rewards-title">
        <div className="shell frontier-rewards__inner">
          <header className="frontier-rewards__header">
            <div>
              <p className="eyebrow mono">REWARDS / TWO PATHS</p>
              <h2 id="frontier-rewards-title">奖励不只属于冠军。</h2>
            </div>
            <p>冠军获得官方奖励；所有有效参赛者仍会按最终排名顺序，继续抽取匿名奖池。</p>
          </header>

          <div className="frontier-rewards__grid">
          <section className="frontier-official-reward" aria-labelledby="official-reward-title">
            <p className="mono">OFFICIAL / CHAMPION</p>
            <div>
              <h3 id="official-reward-title">季度冠军奖励</h3>
              <strong>{OFFICIAL_CHAMPION_REWARD}</strong>
              <p>只授予本赛季第一名，不进入随机奖池。</p>
            </div>
          </section>
          <section className="frontier-random-pool" aria-labelledby="random-pool-title">
            <header>
              <div>
                <p className="mono">ANONYMOUS / FOR EVERYONE</p>
                <h3 id="random-pool-title">穿越者随机奖池</h3>
                <p>最终排名决定抽取顺序，每个有效项目最多一件。</p>
              </div>
              <Link className="frontier-pool-action" href="/frontier/donate">捐献奖品 ↗</Link>
            </header>
            {prizes.length === 0 ? (
              <div className="frontier-pool-empty">
                <span className="mono">POOL / EMPTY</span>
                <p>奖池还没有第一件东西。你可以让它从这里开始。</p>
              </div>
            ) : (
              <ol className="frontier-pool-list">
                {prizes.map((prize, index) => <li key={prize.id}><span className="mono">{String(index + 1).padStart(2, "0")}</span><div><strong>{prize.name}</strong><p>{prize.description}</p></div><span className="mono muted">{prize.status === "assigned" ? "ASSIGNED" : "AVAILABLE"}</span></li>)}
              </ol>
            )}
          </section>
          </div>
        </div>
      </section>

      <section className="shell frontier-archive" aria-labelledby="frontier-history-title">
        <header className="frontier-archive__header">
          <p className="eyebrow mono">HALL OF RECORDS</p>
          <h2 id="frontier-history-title">往届记录</h2>
        </header>
        {history.length === 0 ? (
          <div className="frontier-archive__empty">
            <strong>从这一季开始。</strong>
            <p>首个赛季结算后，冠军、最终排名与随机奖品分配会永久留在这里。</p>
          </div>
        ) : (
          <div className="frontier-history__list">
            {history.map((result) => {
              const resultSeason = seasonFromCode(result.season);
              const champion = result.finalRankings[0];
              return (
                <article key={result.season}>
                  <p className="mono">{resultSeason.name}</p>
                  <div><h3>{result.championRepository ?? "本季无有效冠军"}</h3><p>{champion ? `净新增 ${champion.delta >= 0 ? "+" : ""}${champion.delta} Star` : "没有通过最终资格的报名"}</p></div>
                  <ul>{result.prizeAssignments.map((item) => <li key={`${item.repository}-${item.prizeName}`}><span>{item.repository}</span><strong>{item.prizeName}</strong></li>)}</ul>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
