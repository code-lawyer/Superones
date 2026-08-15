import { ChannelRibbon } from "@/components/channel-ribbon";
import { PageIntro } from "@/components/page-intro";

export default function SicLoading() {
  return (
    <>
      <PageIntro
        className="channel-page-intro"
        code="SiC / TECHNOLOGY INDEX"
        title="血肉苦弱，硅碳共生"
        lead="从代码、模型、论文与一手档案中，看见技术趋势正在怎样形成。"
        meta="LAST PUBLISHED 正在读取"
      />
      <ChannelRibbon identity="SILICON × CARBON" slogan="WE WILL REDEFINE EVOLUTION." />
      <main className="sic-overview-loading" aria-busy="true">
        <p role="status">正在读取 SiC 当前快照…</p>
      </main>
    </>
  );
}
