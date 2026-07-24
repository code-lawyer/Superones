import type { TrendProject } from "./types";
import { getModelSnapshotBoards } from "./sic-snapshots.ts";

export type SicBoardItem = {
  id: string;
  name: string;
  value: number | null;
  href?: string;
  address?: string;
};

export type SicBoard = {
  id: "github-trending" | "github-24h" | "github-7d" | "hugging-face" | "openrouter";
  eyebrow: string;
  title: string;
  metric: string;
  description: string;
  emptyMessage?: string;
  items: SicBoardItem[];
};

export type SicContentGroup = {
  id: "papers" | "archive" | "courses" | "podcasts";
  title: "论文" | "档案" | "课程" | "播客";
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
    id: "archive",
    title: "档案",
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

function githubItem(project: TrendProject, value: number) {
  return {
    id: `${project.owner}/${project.repo}`,
    name: `${project.owner}/${project.repo}`,
    value,
    href: `/sic/${project.owner}/${project.repo}`,
    address: `https://github.com/${project.owner}/${project.repo}`,
  };
}

export function createGithubBoards(projects: TrendProject[]): SicBoard[] {
  const trending = [...projects].sort((a, b) => a.rank - b.rank);
  const daily = [...projects].sort((a, b) => b.delta24 - a.delta24);
  const weekly = [...projects].sort((a, b) => b.delta7 - a.delta7);

  return [
    {
      id: "github-trending",
      eyebrow: "GITHUB / OFFICIAL",
      title: "Github Trending",
      metric: "累计 Star",
      description: "GitHub 官方 Trending 的当日项目快照。",
      emptyMessage: "本期数据正在整理。",
      items: trending.map((project) => githubItem(project, project.stars)),
    },
    {
      id: "github-24h",
      eyebrow: "GITHUB / ALL REPOS",
      title: "24Hours热点",
      metric: "新增 Star",
      description: "全站公开仓库在近 24 小时内的新增 Star。",
      emptyMessage: "本期数据正在整理。",
      items: daily.map((project) => githubItem(project, project.delta24)),
    },
    {
      id: "github-7d",
      eyebrow: "GITHUB / ALL REPOS",
      title: "7days趋势",
      metric: "新增 Star",
      description: "全站公开仓库在近 7 天内的新增 Star。",
      emptyMessage: "本期数据正在整理。",
      items: weekly.map((project) => githubItem(project, project.delta7)),
    },
  ];
}

export async function getModelBoards(): Promise<SicBoard[]> {
  const snapshot = await getModelSnapshotBoards();
  return [
    {
    id: "hugging-face",
    eyebrow: "HUGGING FACE / MODELS",
    title: "HuggingFace下载排行",
    metric: "新增下载",
    description: snapshot.huggingFaceReady ? "Hugging Face 官方累计下载快照计算的近 7 日增长。" : "正在积累 Hugging Face 官方累计下载快照，满 7 日后开始排名。",
    emptyMessage: snapshot.huggingFaceReady ? "本期数据正在整理。" : "近 7 日数据积累中。",
    items: snapshot.huggingFace,
  },
  {
    id: "openrouter",
    eyebrow: "OPENROUTER / MODELS",
    title: "OpenRouter调用排行",
    metric: "官方周排序",
    description: "OpenRouter 官方周使用排序，只反映经 OpenRouter 路由的模型使用。",
    emptyMessage: "本期数据正在整理。",
    items: snapshot.openRouter,
  },
  ];
}
