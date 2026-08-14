import "server-only";

import sicSourceRegistry from "../config/sic-source-registry.json" with { type: "json" };
import { getSicStoredContent } from "./sic-content-store.ts";
import {
  SIC_CONTENT_GROUP_IDS,
  type SicContentGroupId,
  type SicContentItem,
  type SicContentState,
} from "./sic-content-types.ts";
import type { InformationItem } from "./types.ts";

export type SicContentByGroup = Record<SicContentGroupId, SicContentItem[]>;
export type SicDelayedSource = {
  sourceId: string;
  sourceName: string;
  group?: SicContentGroupId;
  status: "failure" | "partial";
};

function timestamp(item: SicContentItem) {
  const value = Date.parse(item.publishedAt ?? item.collectedAt);
  return Number.isNaN(value) ? 0 : value;
}

export function latestSicContentPerSource(items: SicContentItem[]) {
  const seen = new Set<string>();
  return [...items]
    .sort((left, right) => timestamp(right) - timestamp(left))
    .filter((item) => {
      if (seen.has(item.sourceId)) return false;
      seen.add(item.sourceId);
      return true;
    });
}

export function latestSicPapers(items: SicContentItem[]) {
  return [...items].sort((left, right) => {
    if (left.rankingWeek && right.rankingWeek && left.rankingWeek !== right.rankingWeek) {
      return right.rankingWeek.localeCompare(left.rankingWeek);
    }
    if (left.weeklyRank && right.weeklyRank) return left.weeklyRank - right.weeklyRank;
    return timestamp(right) - timestamp(left);
  });
}

export async function getSicContent() {
  const stored = await getSicStoredContent();
  const groups: SicContentByGroup = { papers: [], documents: [], courses: [], podcasts: [] };
  const updatedAt = stored.state.updatedAt ? Date.parse(stored.state.updatedAt) : 0;
  const sourceDelayed = stored.reports.some((report) => report.status === "failure" || report.status === "partial");
  const state = {
    ...stored.state,
    stale: sourceDelayed || !updatedAt || Date.now() - updatedAt > 36 * 60 * 60 * 1000,
  };
  const delayedSources: SicDelayedSource[] = stored.reports.flatMap((report) => {
    if (report.status !== "failure" && report.status !== "partial") return [];
    const source = sicSourceRegistry.sources.find((candidate) => candidate.id === report.sourceId);
    return [{
      sourceId: report.sourceId,
      sourceName: source?.name ?? report.sourceId,
      group: (source?.group === "archive" ? "documents" : source?.group) as SicContentGroupId | undefined,
      status: report.status,
    }];
  });
  for (const item of stored.items) {
    const group = (item.group as string) === "archive" ? "documents" : item.group;
    groups[group].push({ ...item, group });
  }
  groups.papers = latestSicPapers(groups.papers);
  for (const group of SIC_CONTENT_GROUP_IDS.filter((value) => value !== "papers")) {
    groups[group] = latestSicContentPerSource(groups[group]);
  }
  return { groups, state, delayedSources };
}

export function addPublishedDocuments(
  content: { groups: SicContentByGroup; state: SicContentState; delayedSources?: SicDelayedSource[] },
  information: InformationItem[],
) {
  const documents: SicContentItem[] = information
    .filter((item) => item.contentGroup === "documents")
    .map((item) => ({
      id: item.slug,
      sourceId: item.sourceChannelId ?? item.sourceName,
      group: "documents",
      sourceName: item.sourceName,
      publisher: item.sourceName,
      title: item.originalTitle,
      translatedTitle: item.translatedTitle,
      description: item.summary,
      summary: item.summary,
      contentSummary: item.translatedContent,
      url: item.originUrl ?? item.sourceUrl,
      publishedAt: item.publishedAt,
      collectedAt: item.discoveredAt,
      provenanceStatus: item.provenanceStatus === "verified" ? "verified" : "declared",
    }));
  return {
    ...content,
    groups: {
      ...content.groups,
      documents: latestSicContentPerSource([
        ...content.groups.documents,
        ...documents,
      ]),
    },
  };
}
