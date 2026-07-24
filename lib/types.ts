export const EVENT_CATEGORIES = ["模型与产品", "研究与能力", "公司与市场", "政策与安全", "开源与生态"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const SOURCE_ROLES = ["官方", "媒体", "测试", "评论", "研究"] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

export const PUBLISHER_KINDS = ["organization", "person", "editorial_media", "community", "platform", "aggregator", "open_source_project"] as const;
export type PublisherKind = (typeof PUBLISHER_KINDS)[number];

export const EVIDENCE_NATURES = ["primary", "reported_analysis", "social_community", "discovery_aggregate", "non_information_data"] as const;
export type EvidenceNature = (typeof EVIDENCE_NATURES)[number];

export const CLASSIFICATION_CONFIDENCES = ["high", "medium", "low"] as const;
export type ClassificationConfidence = (typeof CLASSIFICATION_CONFIDENCES)[number];

export type EventRecord = {
  slug: string;
  record: string;
  category: EventCategory | "公司公告" | "人物观点" | "播客" | "研究文章";
  title: string;
  judgment?: string;
  originalTitle?: string;
  summary: string;
  significance: string;
  entities: string[];
  firstSeen: string;
  updated: string;
  sources?: { name: string; url: string; publishedAt: string; author?: string; role?: SourceRole; informationSlug?: string }[];
  timeline?: { time: string; text: string }[];
};

export type InformationItem = {
  slug: string;
  translatedTitle: string;
  originalTitle: string;
  summary: string;
  translatedContent: string;
  originalContent: string;
  originalLanguage: string;
  sourceName: string;
  sourceRole: SourceRole;
  sourceUrl: string;
  author: string;
  publishedAt: string | null;
  discoveredAt: string;
  eventSlugs: string[];
  primaryEventSlug?: string;
  originalDisplay: "full" | "excerpt";
  contentHash?: string;
  sourceChannelId?: string;
  originalPublisher?: string;
  ownerEntity?: string;
  publisherKind?: PublisherKind;
  evidenceNature?: EvidenceNature;
  classificationConfidence?: ClassificationConfidence;
  sourceStream?: "information" | "statements";
  originPlatform?: "web" | "x";
  originAccount?: string;
  originContentId?: string;
  originUrl?: string;
  originResolution?: "declared" | "verified" | "unresolved";
  transportKind?: string;
  transportProvider?: string;
  eventCandidateKey?: string;
};

export type QuarantinedContent = {
  id: string;
  batchId: string;
  kind: "information" | "repository" | "event";
  sourceKey: string;
  errorCode: string;
  summary: string;
  createdAt: string;
};

export type BatchReceipt = {
  batchId: string;
  payloadHash: string;
  receivedAt: string;
  status: "succeeded";
  informationCount: number;
  eventCount: number;
  projectCount: number;
  quarantinedCount: number;
};

export type Service = {
  slug: string;
  code: string;
  category: "法务" | "税务与财务" | "知识产权" | "申报与备案" | "人力资源" | "传媒与传播";
  name: string;
  price: string;
  period: string;
  audience: string;
  includes: string[];
  excludes: string[];
  materials: string[];
  deliverables: string[];
  revision: string;
};

export type TrendProject = {
  owner: string;
  repo: string;
  rank: number;
  change: string;
  category: string;
  description: string;
  language: string;
  stars: number;
  delta24: number;
  delta7: number;
  license: string;
  updated: string;
  captured: string;
  fit: string;
  readmeSha?: string;
};

export type FrontierEntry = {
  rank: number;
  repo: string;
  description: string;
  baseline: number;
  current: number;
  delta: number;
  submitted: string;
};

export type ContentState = {
  mode: "demo" | "live";
  updatedAt: string | null;
  sourceCount: number;
  eventCount: number;
  informationCount: number;
  projectCount: number;
  quarantinedCount: number;
  publicationVersion: number;
};
