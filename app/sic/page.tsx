import type { Metadata } from "next";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { PageIntro } from "@/components/page-intro";
import { SicContentGroups } from "@/components/sic-content-groups";
import { SicRankings } from "@/components/sic-rankings";
import { getDirectRankingBoards } from "@/lib/direct-rankings";
import { sicContentGroups, type SicBoard } from "@/lib/sic";
import { getSicContent } from "@/lib/sic-content";

export const metadata: Metadata = { title: "SiC 学院" };

export const dynamic = "force-dynamic";

export default async function SicPage() {
  const [directBoards, sicContent] = await Promise.all([
    getDirectRankingBoards().catch(() => []),
    getSicContent().catch(() => ({
      groups: { papers: [], archive: [], courses: [], podcasts: [] },
      state: { updatedAt: null, itemCount: 0, sourceCount: 0 },
    })),
  ]);
  const boards: SicBoard[] = directBoards.map((board) => ({
    id: board.id.replace(/:/g, "-"),
    eyebrow: board.eyebrow,
    title: board.title,
    metric: board.providerMetric,
    description: `来源平台：${board.provider}；原始口径：${board.providerView}。页面严格保留平台返回顺序。`,
    capturedAt: board.capturedAt,
    sourceUrl: board.sourceUrl,
    emptyMessage: "本期平台榜单暂不可用。",
    items: board.items.map((item) => ({
      id: item.id,
      name: item.name,
      value: item.value,
      href: item.itemUrl,
      address: item.itemUrl,
    })),
  }));
  return (
    <>
      <PageIntro code="SiC / TECHNOLOGY INDEX" title="血肉苦弱，硅碳共生" lead="从代码、模型、论文与一手档案中，看见技术趋势正在怎样形成。" meta="TECHNOLOGY / FIXED SOURCES" />
      <ChannelRibbon identity="SILICON × CARBON" slogan="WE WILL REDEFINE EVOLUTION." />
      <nav className="sic-mobile-index shell mono" aria-label="SiC 页面索引">
        {sicContentGroups.map((group) => <a href={`#sic-group-${group.id}`} key={group.id}>{group.title}</a>)}
        <a href="#sic-rankings">趋势榜</a>
      </nav>
      <section className="shell sic-stage" aria-label="SiC 技术阅读与趋势榜">
        <div className="sic-stage__columns">
          <SicContentGroups groups={sicContentGroups} content={sicContent.groups} />
          <aside className="sic-stage__rail" aria-label="技术趋势榜单">
            <SicRankings boards={boards} />
          </aside>
        </div>
      </section>
    </>
  );
}
