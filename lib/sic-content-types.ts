export const SIC_CONTENT_GROUP_IDS = ["papers", "archive", "courses", "podcasts"] as const;

export type SicContentGroupId = (typeof SIC_CONTENT_GROUP_IDS)[number];

export type SicContentItem = {
  id: string;
  sourceId: string;
  group: SicContentGroupId;
  sourceName: string;
  publisher: string;
  title: string;
  translatedTitle?: string;
  description?: string;
  summary: string;
  contentSummary?: string;
  url: string;
  publishedAt: string | null;
  collectedAt: string;
};

export type SicSourceCollectionReport = {
  sourceId: string;
  status: "success" | "empty" | "failure";
  collectedAt: string;
  itemCount: number;
  error?: string;
};

export type SicContentState = {
  updatedAt: string | null;
  itemCount: number;
  sourceCount: number;
};
