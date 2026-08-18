import {
  HomeExperience,
  type HomeExperienceData,
} from "@/components/home-experience";
import "./home.css";
import "./mobile-home.css";
import { formatNumber } from "@/lib/number-format";
import { beijingTime, compareEventsNewest, eventCategory, eventJudgment } from "@/lib/feed-format";
import { seasonForDate } from "@/lib/frontier-domain";
import { getFrontierSeasonLaunchState } from "@/lib/frontier-store";
import { publicPreviewLabel } from "@/lib/public-preview-label";
import {
  getCachedDirectRankingBoards,
  getCachedFrontierRanking,
  getCachedPublishedServiceCatalog,
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
  const [contentResult, rankingResult, sicResult, frontierRankingResult, frontierLaunchResult, opcResult] = await Promise.all([
    getCachedPublicContent().then((value) => ({ value, unavailable: false }), () => ({ value: null, unavailable: true })),
    getCachedDirectRankingBoards().then((value) => ({ value, unavailable: false }), () => ({ value: [], unavailable: true })),
    getCachedSicContent().then((value) => ({ value, unavailable: false }), () => ({ value: null, unavailable: true })),
    getCachedFrontierRanking(frontierSeason.code).then(
      (value) => ({ value, unavailable: false }),
      () => ({ value: { rankings: [], updatedAt: null }, unavailable: true }),
    ),
    getFrontierSeasonLaunchState(frontierSeason.code).then(
      (value) => ({ value, unavailable: false }),
      () => ({ value: { writesEnabled: false }, unavailable: true }),
    ),
    getCachedPublishedServiceCatalog().then(
      (value) => ({ value, unavailable: false }),
      () => ({ value: { infrastructure: [], specialties: [], rangers: [] }, unavailable: true }),
    ),
  ]);
  const content = contentResult.value;
  const rankingBoards = rankingResult.value;
  const sicContent = sicResult.value;
  const frontierRanking = frontierRankingResult.value;
  const frontierLaunchState = frontierLaunchResult.value;
  const opcCatalog = opcResult.value;
  const githubToday = rankingBoards.find((board) => board.id === "github:today");
  const latestEvents = [...(content?.events ?? [])].sort(compareEventsNewest);
  const opcEntries = [
    {
      href: "/opc?view=infrastructure",
      code: `${opcCatalog.infrastructure.length} INFRASTRUCTURES`,
      name: "基础设施",
      summary: "把跨领域经营能力建设成可运行的完整交付。",
    },
    {
      href: "/opc?view=specialties",
      code: `${opcCatalog.specialties.length} SPECIALTIES`,
      name: "专项服务",
      summary: "按六个专业领域解决一个边界清楚的问题。",
    },
    {
      href: "/opc?view=rangers",
      code: `${opcCatalog.rangers.length} RANGER IDENTITIES`,
      name: "游骑兵协会",
      summary: "直接联系经基本核验的外部独立顾问。",
    },
  ];
  const updatedAt = content?.state.updatedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Shanghai",
      }).format(new Date(content.state.updatedAt))
    : "待发布";
  const sicItems = sicContent
    ? Object.values(sicContent.groups).flat().sort((left, right) => {
        const leftTime = left.publishedAt ?? left.collectedAt;
        const rightTime = right.publishedAt ?? right.collectedAt;
        return rightTime.localeCompare(leftTime);
      })
    : [];
  const latestSicItem = sicItems[0] ?? null;
  const previewLabel = publicPreviewLabel();
  const kindLabel = {
    papers: "论文",
    documents: "档案",
    courses: "课程",
    podcasts: "播客",
  } as const;
  const homeData: HomeExperienceData = {
    stateLabel: previewLabel || (content?.state.updatedAt ? "最近一次成功发布" : "公开内容准备中"),
    updatedAt: content?.state.updatedAt ? `${compactDateTime(content.state.updatedAt)} CST` : updatedAt,
    sourceCount: content?.state.sourceCount ?? 0,
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
