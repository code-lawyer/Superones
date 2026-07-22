export type EventRecord = {
  slug: string;
  record: string;
  category: "公司公告" | "人物观点" | "播客" | "研究文章";
  title: string;
  originalTitle: string;
  summary: string;
  significance: string;
  entities: string[];
  firstSeen: string;
  updated: string;
  sources: { name: string; url: string; publishedAt: string }[];
  timeline: { time: string; text: string }[];
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
  projectCount: number;
};
