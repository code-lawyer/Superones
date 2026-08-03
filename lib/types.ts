export const EVENT_CATEGORIES = ["模型与产品", "研究与能力", "公司与市场", "政策与安全", "开源与生态"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const SOURCE_ROLES = ["官方", "媒体", "测试", "评论", "研究"] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

import type {
  ContentGroup,
  ItemKind,
  ProvenanceRole,
  ProvenanceStatus,
} from "./content-provenance.ts";
import type { ContentFormat } from "./content-markup.ts";

export const PUBLISHER_KINDS = ["organization", "person", "editorial_media", "community", "community_user", "platform", "aggregator", "open_source_project"] as const;
export type PublisherKind = (typeof PUBLISHER_KINDS)[number];

export const EVIDENCE_NATURES = ["primary", "reported_analysis", "social_community", "discovery_aggregate", "non_information_data"] as const;
export type EvidenceNature = (typeof EVIDENCE_NATURES)[number];

export const CLASSIFICATION_CONFIDENCES = ["high", "medium", "low"] as const;
export type ClassificationConfidence = (typeof CLASSIFICATION_CONFIDENCES)[number];

export const CONTENT_CLASSES = ["news_report", "official_announcement", "analysis", "interview", "recruitment", "promotion", "digest", "other"] as const;
export type ContentClass = (typeof CONTENT_CLASSES)[number];

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
  sources?: {
    name: string;
    url: string;
    publishedAt: string;
    author?: string;
    role?: SourceRole;
    informationSlug?: string;
    translatedTitle?: string;
    originalTitle?: string;
    summary?: string;
    translatedContent?: string;
    originalContent?: string;
    contentFormat?: ContentFormat;
    originalLanguage?: string;
    originalDisplay?: "full" | "excerpt";
    contentGroup?: ContentGroup;
    sourceStream?: "information" | "roadside" | "statements";
  }[];
  timeline?: { time: string; text: string }[];
};

export type InformationItem = {
  slug: string;
  translatedTitle: string;
  originalTitle: string;
  summary: string;
  translatedContent: string;
  originalContent: string;
  contentFormat?: ContentFormat;
  originalLanguage: string;
  sourceName: string;
  sourceRole: SourceRole;
  sourceUrl: string;
  externalUrl?: string;
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
  contentGroup?: ContentGroup;
  itemKind?: ItemKind;
  provenanceRole?: ProvenanceRole;
  provenanceStatus?: ProvenanceStatus;
  discoveryPaths?: string[];
  sourceStream?: "information" | "roadside" | "statements";
  originPlatform?: "web" | "x";
  originAccount?: string;
  originContentId?: string;
  originUrl?: string;
  originResolution?: "declared" | "verified" | "unresolved";
  transportKind?: string;
  transportProvider?: string;
  eventCandidateKey?: string;
  contentClass?: ContentClass;
  eventEligible?: boolean;
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

export type ContentState = {
  mode: "demo" | "live" | "degraded";
  updatedAt: string | null;
  sourceCount: number;
  eventCount: number;
  informationCount: number;
  projectCount: number;
  quarantinedCount: number;
  publicationVersion: number;
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
