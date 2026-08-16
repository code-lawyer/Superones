import type { Metadata } from "next";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { PageIntro } from "@/components/page-intro";
import { SicOverview } from "@/components/sic-overview";
import {
  getCachedDirectRankingBoards,
} from "@/lib/public-read-cache";
import { getPublicSicSnapshot } from "@/lib/sic-public-snapshot";
import { beijingTime } from "@/lib/feed-format";
import { publicPreviewLabel } from "@/lib/public-preview-label";
import type { SicBoard } from "@/lib/sic";

export const metadata: Metadata = { title: "SiC 学院" };
export const dynamic = "force-dynamic";

export default async function SicPage() {
  const [sicSnapshot, directBoards] = await Promise.all([
    getPublicSicSnapshot(),
    getCachedDirectRankingBoards().catch(() => []),
  ]);
  const sicContent = sicSnapshot.content;
  const boards: SicBoard[] = directBoards.map((board) => ({
    id: board.id.replace(/:/g, "-"),
    eyebrow: board.eyebrow,
    title: board.title,
    metric: board.providerMetric,
    description: `来源平台：${board.provider}；原始口径：${board.providerView}。页面严格保留平台返回顺序。`,
    capturedAt: board.capturedAt,
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
  const previewLabel = publicPreviewLabel();

  return (
    <>
      <PageIntro
        className="channel-page-intro"
        code="SiC / TECHNOLOGY INDEX"
        title="血肉苦弱，硅碳共生"
        lead="从代码、模型、论文与一手档案中，看见技术趋势正在怎样形成。"
        meta={`LAST PUBLISHED ${updatedLabel}${previewLabel ? ` / ${previewLabel}` : ""}`}
      />
      <ChannelRibbon identity="SILICON × CARBON" slogan="WE WILL REDEFINE EVOLUTION." />
      <SicOverview
        content={sicContent.groups}
        boards={boards}
        updatedLabel={updatedLabel}
        snapshotIds={sicSnapshot.snapshotIds}
      />
    </>
  );
}
