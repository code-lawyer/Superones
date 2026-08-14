import type { Metadata } from "next";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { PageIntro } from "@/components/page-intro";
import { SicOverview } from "@/components/sic-overview";
import {
  getCachedDirectRankingBoards,
  getCachedPublicContent,
  getCachedSicContent,
} from "@/lib/public-read-cache";
import { addPublishedDocuments } from "@/lib/sic-content";
import { beijingTime } from "@/lib/feed-format";
import type { SicBoard } from "@/lib/sic";

export const metadata: Metadata = { title: "SiC 学院" };
export const dynamic = "force-dynamic";

export default async function SicPage() {
  const [sicResult, boardsResult, publicContent] = await Promise.all([
    getCachedSicContent().then((value) => ({ value, unavailable: false }), () => ({
      value: {
        groups: { papers: [], documents: [], courses: [], podcasts: [] },
        state: { updatedAt: null, itemCount: 0, sourceCount: 0, stale: false },
        delayedSources: [],
      },
      unavailable: true,
    })),
    getCachedDirectRankingBoards().then(
      (value) => ({ value, unavailable: false }),
      () => ({ value: [], unavailable: true }),
    ),
    getCachedPublicContent().then(
      (value) => ({ value: value.information, unavailable: false }),
      () => ({ value: [], unavailable: true }),
    ),
  ]);
  const sicContent = addPublishedDocuments(sicResult.value, publicContent.value);
  const boards: SicBoard[] = boardsResult.value.map((board) => ({
    id: board.id.replace(/:/g, "-"),
    eyebrow: board.eyebrow,
    title: board.title,
    metric: board.providerMetric,
    description: `来源平台：${board.provider}；原始口径：${board.providerView}。页面严格保留平台返回顺序。`,
    capturedAt: board.capturedAt,
    stale: board.stale,
    sourceUrl: board.sourceUrl,
    emptyMessage: "当前平台榜单暂不可用。",
    items: board.items.map((item) => ({
      id: item.id,
      name: item.name,
      value: item.value,
      href: item.itemUrl,
      address: item.itemUrl,
    })),
  }));
  const updatedLabel = beijingTime(sicContent.state.updatedAt, true);

  return (
    <>
      <PageIntro
        className="channel-page-intro"
        code="SiC / TECHNOLOGY INDEX"
        title="血肉苦弱，硅碳共生"
        lead="从代码、模型、论文与一手档案中，看见技术趋势正在怎样形成。"
        meta={`LAST PUBLISHED ${updatedLabel}${sicContent.state.stale ? " / 更新延迟" : ""}`}
      />
      <ChannelRibbon identity="SILICON × CARBON" slogan="WE WILL REDEFINE EVOLUTION." />
      <SicOverview
        content={sicContent.groups}
        boards={boards}
        contentUnavailable={sicResult.unavailable}
        documentsSupplementUnavailable={publicContent.unavailable}
        rankingsUnavailable={boardsResult.unavailable}
        delayedSources={sicContent.delayedSources ?? []}
        updatedLabel={updatedLabel}
      />
    </>
  );
}
