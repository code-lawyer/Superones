import type { Metadata } from "next";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { PageIntro } from "@/components/page-intro";
import { SicContentGroups } from "@/components/sic-content-groups";
import { SicRankings } from "@/components/sic-rankings";
import { getModelBoards, sicContentGroups } from "@/lib/sic";
import { getSicContent } from "@/lib/sic-content";
import { getSicExtensionRankings } from "@/lib/sic-extensions";
import { getGithubRankingBoards } from "@/lib/sic-github-rankings";
import { localSicVisualPreview } from "@/lib/sic-visual-preview";

export const metadata: Metadata = { title: "SiC 学院" };

export const dynamic = "force-dynamic";

export default async function SicPage() {
  const [githubBoards, modelBoards, sicContent, extensionRankings] = await Promise.all([
    getGithubRankingBoards().catch(() => []),
    getModelBoards().catch(() => []),
    getSicContent().catch(() => ({
      groups: { papers: [], archive: [], courses: [], podcasts: [] },
      state: { updatedAt: null, itemCount: 0, sourceCount: 0 },
    })),
    getSicExtensionRankings().catch(() => ({
      capturedAt: null,
      skills: { selected: [], surging: [], surgingReady: false },
      mcps: { selected: [], surging: [], surgingReady: false },
    })),
  ]);
  const preview = localSicVisualPreview(githubBoards, modelBoards, sicContent.groups, extensionRankings);
  return (
    <>
      <PageIntro code="SiC / TECHNOLOGY INDEX" title="血肉苦弱，硅碳共生" lead="从代码、模型、论文与一手档案中，看见技术趋势正在怎样形成。" meta={preview.enabled ? "LOCAL VISUAL PREVIEW / 示例数据" : "TECHNOLOGY / FIXED SOURCES"} />
      <ChannelRibbon identity="SILICON × CARBON" slogan="WE WILL REDEFINE EVOLUTION." />
      <nav className="sic-mobile-index shell mono" aria-label="SiC 页面索引">
        {sicContentGroups.map((group) => <a href={`#sic-group-${group.id}`} key={group.id}>{group.title}</a>)}
        <a href="#sic-rankings">趋势榜</a>
      </nav>
      <section className="shell sic-stage" aria-label="SiC 技术阅读与趋势榜">
        <div className="sic-stage__columns">
          <SicContentGroups groups={sicContentGroups} content={preview.content} />
          <aside className="sic-stage__rail" aria-label="技术趋势榜单">
            <SicRankings
              githubBoards={preview.githubBoards}
              modelBoards={preview.modelBoards}
              extensionRankings={preview.extensionRankings}
            />
          </aside>
        </div>
      </section>
    </>
  );
}
