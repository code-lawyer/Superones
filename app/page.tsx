import {
  HomeExperience,
  type HomeExperienceData,
} from "@/components/home-experience";
import { formatNumber } from "@/lib/number-format";
import { beijingTime, compareEventsNewest, eventCategory, eventJudgment } from "@/lib/feed-format";
import { seasonForDate } from "@/lib/frontier-domain";
import { getFrontierSeasonLaunchState } from "@/lib/frontier-store";
import { infrastructureServices, rangerProfiles, specialtyServices } from "@/lib/opc-catalog";
import {
  getCachedDirectRankingBoards,
  getCachedFrontierRanking,
  getCachedPublicContent,
  getCachedSicContent,
} from "@/lib/public-read-cache";

export const dynamic = "force-dynamic";

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

export default async function HomePage() {
  const frontierSeason = seasonForDate(new Date());
  const [content, rankingBoards, sicContent, frontierRanking, frontierLaunchState] = await Promise.all([
    getCachedPublicContent(),
    getCachedDirectRankingBoards().catch(() => []),
    getCachedSicContent().catch(() => null),
    getCachedFrontierRanking(frontierSeason.code).catch(() => ({ rankings: [], updatedAt: null })),
    getFrontierSeasonLaunchState(frontierSeason.code).catch(() => ({ writesEnabled: false })),
  ]);
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
    ? new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Shanghai",
      }).format(new Date(content.state.updatedAt))
    : content.state.mode === "degraded" ? "服务降级" : "更新中";
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
  const homeData: HomeExperienceData = {
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
      writesEnabled: frontierLaunchState.writesEnabled,
      seasonName: frontierSeason.name,
      settlementDate: new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeZone: "Asia/Shanghai",
      }).format(new Date(frontierSeason.endsAt)),
      updatedAt: compactDateTime(frontierRanking.updatedAt),
      rankings: frontierRanking.rankings.slice(0, 3).map((entry) => ({
        rank: entry.rank,
        repo: entry.repo,
        delta: `净增 ${entry.delta >= 0 ? "+" : ""}${formatNumber(entry.delta)} Star`,
      })),
    },
  };

  return <HomeExperience data={homeData} />;
}
