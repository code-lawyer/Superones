/*
 * THESIS: SiC is one continuous technical register; it refuses route-by-route fragmentation.
 * OWN-WORLD: archive paper, carbon reversals, editorial scale, connected column rules, zero radius.
 * STORY: enter through the weekly paper, cross platform heat, scan every fixed-source lane, keep context.
 * FIRST VIEWPORT: production intro and slogan ribbon remain exact; the lead paper begins the register below.
 * FORM: user-approved Variant C, an editorial column overview; staging fixed by the approved prototype.
 */

import type { SicContentByGroup, SicDelayedSource } from "@/lib/sic-content";
import type { SicBoard } from "@/lib/sic";
import type { SicContentGroupId } from "@/lib/sic-content-types";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import { sicContentGroups } from "@/lib/sic";
import { toSicPublicRecord } from "@/lib/sic-public-projection";
import { SicContentGroups } from "./sic-content-groups";
import { SicProgressiveRecords } from "./sic-progressive-records";
import { SicRankings } from "./sic-rankings";

export function SicOverview({
  content,
  boards,
  contentUnavailable,
  documentsSupplementUnavailable,
  rankingsUnavailable,
  delayedSources,
  updatedLabel,
  snapshotIds,
}: {
  content: SicContentByGroup;
  boards: SicBoard[];
  contentUnavailable: boolean;
  documentsSupplementUnavailable: boolean;
  rankingsUnavailable: boolean;
  delayedSources: SicDelayedSource[];
  updatedLabel: string;
  snapshotIds: Record<SicContentGroupId, string>;
}) {
  const lead = content.papers[0];
  const delayedPaperSources = delayedSources.filter((source) => source.group === "papers");
  const totalItems = Object.values(content).reduce((total, items) => total + items.length, 0);

  return (
    <div className="sic-overview">
      <section className="sic-overview-lead" id="sic-papers" aria-labelledby="sic-papers-title">
        <div className="sic-overview-lead__mark"><strong>SiC</strong><span>PAPERS / 论文</span></div>
        {lead ? (
          <article>
            <span>论文主栏 / 周榜 {lead.weeklyRank ?? "—"}</span>
            <h2 id="sic-papers-title">{decodeHtmlEntities(lead.translatedTitle ?? lead.title)}</h2>
            <p>{lead.description ?? lead.summary}</p>
            {lead.contentSummary && lead.contentSummary !== (lead.description ?? lead.summary) ? (
              <p className="sic-overview-content-summary">{lead.contentSummary}</p>
            ) : null}
            <a
              href={lead.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`${decodeHtmlEntities(lead.translatedTitle ?? lead.title)}论文原文（在新标签页打开）`}
            >查看论文原文 ↗</a>
          </article>
        ) : <p className="sic-overview-empty">{contentUnavailable ? "论文读取失败；暂无可用缓存。" : "论文内容正在准备中。"}</p>}
        {delayedPaperSources.length ? (
          <p className="sic-overview-group__status" role="status">
            论文更新延迟：{delayedPaperSources.map((source) => source.sourceName).join("、")}；当前展示上一成功快照。
          </p>
        ) : null}
        <aside className="sic-overview-papers" aria-label="更多论文">
          <header><span>更多论文</span><b>共 {content.papers.length} 篇</b></header>
          <SicProgressiveRecords
            key={`papers:${snapshotIds.papers}`}
            group="papers"
            initialItems={content.papers.slice(1, 4).map(toSicPublicRecord)}
            initialNextOffset={Math.min(4, content.papers.length)}
            totalCount={content.papers.length}
            snapshotId={snapshotIds.papers}
            label="论文"
            compact
            indexOffset={1}
            countOffset={1}
          />
        </aside>
      </section>

      <section className="sic-overview-rankings" id="sic-rankings" aria-labelledby="sic-rankings-title">
        <div className="sic-overview-rankings__inner">
          <header>
            <span>PLATFORM-NATIVE / 原始口径</span>
            <h2 id="sic-rankings-title">趋势榜</h2>
            <p>{
              rankingsUnavailable
                ? "趋势榜当前读取失败；恢复后将显示采集时间与原始来源。"
                : boards.length > 0
                  ? "切换平台榜单；每个榜单保留采集时间与原始来源。"
                  : "当前没有可用平台榜单；页面不会用样例填补空缺。"
            }</p>
          </header>
          <SicRankings boards={boards} unavailable={rankingsUnavailable} />
        </div>
      </section>

      <SicContentGroups
        groups={sicContentGroups.filter((group) => group.id !== "papers")}
        content={content}
        unavailable={contentUnavailable}
        unavailableGroups={{ documents: documentsSupplementUnavailable }}
        delayedSources={delayedSources}
        snapshotIds={snapshotIds}
      />

      <section className="sic-overview-end" id="sic-end" aria-labelledby="sic-end-title">
        <div>
          <span>CURRENT SNAPSHOT / 当前总卷</span>
          <h2 id="sic-end-title">本次快照已到底。</h2>
        </div>
        <p>本页聚合 {totalItems} 条内容；最后发布于 {updatedLabel}。栏目位置与当前榜单均可由地址直接返回。</p>
        <nav aria-label="页末快捷定位">
          <a href="#sic-papers">回到论文 ↑</a>
          <a href="#sic-rankings">回到趋势榜 ↑</a>
        </nav>
      </section>
    </div>
  );
}
