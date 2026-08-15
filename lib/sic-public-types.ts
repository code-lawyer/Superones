import type { SicContentGroupId } from "./sic-content-types.ts";

export type SicPublicRecord = {
  id: string;
  sourceName: string;
  title: string;
  translatedTitle?: string;
  summary: string;
  contentSummary?: string;
  url: string;
  publishedAt: string | null;
  weeklyRank?: number;
};

export type SicPublicPage = {
  group: SicContentGroupId;
  items: SicPublicRecord[];
  nextOffset: number;
  totalCount: number;
  snapshotId: string;
};
