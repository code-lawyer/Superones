export type SicBoardItem = {
  id: string;
  name: string;
  value: number | null;
  href?: string;
  address?: string;
};

export type SicBoard = {
  id: string;
  eyebrow: string;
  title: string;
  metric: string;
  description: string;
  capturedAt?: string;
  stale?: boolean;
  sourceUrl?: string;
  emptyMessage?: string;
  items: SicBoardItem[];
};

export type SicContentGroup = {
  id: "papers" | "documents" | "courses" | "podcasts";
  title: "论文" | "文档" | "课程" | "播客";
  description: string;
  emptyMessage: string;
};

export const sicContentGroups: SicContentGroup[] = [
  {
    id: "papers",
    title: "论文",
    description: "从经过准入的论文追踪源，建立近期值得进入的研究阅读线索。",
    emptyMessage: "内容正在准备中。",
  },
  {
    id: "documents",
    title: "文档",
    description: "只保留技术机构的正式公开发布：研究、工程、展望与组织新闻。",
    emptyMessage: "内容正在准备中。",
  },
  {
    id: "courses",
    title: "课程",
    description: "课程、公开讲座、研究演讲与工程实践，按完整频道持续更新。",
    emptyMessage: "内容正在准备中。",
  },
  {
    id: "podcasts",
    title: "播客",
    description: "按权威主理人的身份准入整档节目，而不是筛选某一期的嘉宾或话题。",
    emptyMessage: "内容正在准备中。",
  },
];
