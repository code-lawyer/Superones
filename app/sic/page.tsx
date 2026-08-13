import type { Metadata } from "next";
import Link from "next/link";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { PageIntro } from "@/components/page-intro";
import { SicContentGroups } from "@/components/sic-content-groups";
import { SicRankings } from "@/components/sic-rankings";
import {
  getCachedDirectRankingBoards,
  getCachedPublicContent,
  getCachedSicContentGroup,
} from "@/lib/public-read-cache";
import { sicContentGroups, type SicBoard } from "@/lib/sic";
import { addPublishedDocuments } from "@/lib/sic-content";
import type { SicContentByGroup } from "@/lib/sic-content";
import { beijingTime } from "@/lib/feed-format";
import { parseSicView, sicViewHref } from "@/lib/sic-view";

export const metadata: Metadata = { title: "SiC 学院" };

export const dynamic = "force-dynamic";

export default async function SicPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const view = parseSicView((await searchParams).view);
  const [directBoardsResult, storedSicResult, publishedDocuments] = await Promise.all([
    view === "rankings" ? getCachedDirectRankingBoards().then(
      (value) => ({ value, unavailable: false }),
      () => ({ value: [], unavailable: true }),
    ) : Promise.resolve({ value: [], unavailable: false }),
    view === "rankings" ? Promise.resolve({
      value: {
        groups: { papers: [], documents: [], courses: [], podcasts: [] },
        state: { updatedAt: null, itemCount: 0, sourceCount: 0, stale: false },
      },
      unavailable: false,
    }) : getCachedSicContentGroup(view).then(
      (value) => ({ value, unavailable: false }),
      () => ({
        value: {
          groups: { papers: [], documents: [], courses: [], podcasts: [] },
          state: { updatedAt: null, itemCount: 0, sourceCount: 0 },
        },
        unavailable: true,
      }),
    ),
    view === "documents"
      ? getCachedPublicContent().then((value) => value.information)
      : Promise.resolve([]),
  ]);
  const directBoards = directBoardsResult.value;
  const storedSicContent = storedSicResult.value;
  const sicContent = addPublishedDocuments(storedSicContent, publishedDocuments);
  const contentView = view === "rankings" ? null : view;
  const visibleGroups = contentView
    ? sicContentGroups.filter((group) => group.id === contentView)
    : [];
  const visibleContent: SicContentByGroup = { papers: [], documents: [], courses: [], podcasts: [] };
  if (contentView) visibleContent[contentView] = sicContent.groups[contentView];
  const boards: SicBoard[] = directBoards.map((board) => ({
    id: board.id.replace(/:/g, "-"),
    eyebrow: board.eyebrow,
    title: board.title,
    metric: board.providerMetric,
    description: `来源平台：${board.provider}；原始口径：${board.providerView}。页面严格保留平台返回顺序。`,
    capturedAt: board.capturedAt,
    stale: board.stale,
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
  const pageUpdatedAt = view === "rankings"
    ? directBoards.map((board) => board.capturedAt).sort().at(-1) ?? null
    : sicContent.state.updatedAt;
  return (
    <>
      <PageIntro
        className="channel-page-intro"
        code="SiC / TECHNOLOGY INDEX"
        title="血肉苦弱，硅碳共生"
        lead="从代码、模型、论文与一手档案中，看见技术趋势正在怎样形成。"
        meta={`LAST PUBLISHED ${beijingTime(pageUpdatedAt, true)}${sicContent.state.stale ? " / 更新延迟" : ""}`}
      />
      <ChannelRibbon identity="SILICON × CARBON" slogan="WE WILL REDEFINE EVOLUTION." />
      <nav className="sic-mobile-index shell mono" aria-label="SiC 页面索引">
        {sicContentGroups.map((group) => (
          <Link href={sicViewHref(group.id)} key={group.id} aria-current={view === group.id ? "page" : undefined}>
            {group.title}
          </Link>
        ))}
        <Link href={sicViewHref("rankings")} aria-current={view === "rankings" ? "page" : undefined}>趋势榜</Link>
      </nav>
      <section className="shell sic-stage" aria-label="SiC 技术阅读与趋势榜">
        <div className="sic-stage__columns sic-stage__columns--single">
          {contentView ? (
            <SicContentGroups groups={visibleGroups} content={visibleContent} unavailable={storedSicResult.unavailable} />
          ) : (
            <aside className="sic-stage__rail" aria-label="技术趋势榜单">
              <SicRankings boards={boards} unavailable={directBoardsResult.unavailable} />
            </aside>
          )}
        </div>
      </section>
    </>
  );
}
