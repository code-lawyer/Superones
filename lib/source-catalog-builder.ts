import type { SicSource } from "./sic-source-registry.ts";
import type {
  SourceCatalog,
  SourceCatalogItem,
  SourceCatalogMethod,
  SourceCatalogSection,
  SourceCatalogSectionId,
} from "./source-catalog-types.ts";

type InformationSource = {
  id: string;
  name: string;
  role: string;
  publisherKind: string;
  evidenceNature: string;
  classificationConfidence: string;
  channelType: string;
  channelIdentifier: string;
  endpoint: string;
  connector: string;
  aggregator: string | null;
  discoveredFrom: Array<{ repository: string; path: string }>;
};

type SourceBundle = {
  generatedAt: string;
  revision: string;
  sources: InformationSource[];
};

type MethodDefinition = {
  id: string;
  label: string;
  description: string;
};

const informationMethods: Record<string, MethodDefinition> = {
  rss: {
    id: "rss-atom",
    label: "RSS / Atom",
    description: "以机器可读订阅流接入文章、播客和 X 公开动态；同类载体统一由 Feed 解析器处理。",
  },
  hackernews: {
    id: "hacker-news-api",
    label: "Hacker News API",
    description: "读取 Hacker News 官方 Firebase API，补充开发者社区正在讨论的技术信号。",
  },
  json: {
    id: "json-api",
    label: "JSON API",
    description: "读取结构化公开接口，主要用于社区条目和开源项目趋势发现。",
  },
  "github-releases": {
    id: "github-releases",
    label: "GitHub Releases API",
    description: "追踪获批开源仓库的正式版本发布，不把普通 commit 当成产品更新。",
  },
  "github-user-events": {
    id: "github-public-events",
    label: "GitHub Public Events API",
    description: "读取关键建设者的公开 GitHub 活动，用作工程动向信号。",
  },
};

const informationChannelLabels: Record<string, string> = {
  article: "文章 / 官方博客",
  community: "社区讨论",
  "github-release": "开源版本发布",
  "github-trending": "开源项目趋势",
  "github-user-events": "建设者公开活动",
  podcast: "播客",
  x: "X 公开动态",
};

const informationPurposes: Record<string, string> = {
  article: "发现机构、媒体和独立作者发布的新文章，进入资讯瀑布并参与事件编排。",
  community: "补充开发者社区关注的问题与讨论热度，作为发现信号而非单独事实结论。",
  "github-release": "捕捉重要开源工具的正式版本变化，形成可追溯的产品与生态更新。",
  "github-trending": "发现热度快速上升的开源项目，并补充仓库元数据后进入趋势展示。",
  "github-user-events": "观察关键技术建设者的公开工程活动，补充项目和研究动向。",
  podcast: "发现新的长对谈或节目更新，进入资讯流供翻译、摘要和归类。",
  x: "追踪机构与关键个体的公开短动态，为事件发现提供及时信号。",
};

const publisherKinds: Record<string, string> = {
  aggregator: "聚合发现源",
  community: "社区平台",
  editorial_media: "编辑媒体",
  open_source_project: "开源项目",
  organization: "机构",
  person: "个人",
};

const evidenceNatures: Record<string, string> = {
  discovery_aggregate: "发现性聚合",
  primary: "一手材料",
  reported_analysis: "报道 / 分析",
  social_community: "公开社交 / 社区信号",
};

const confidenceLabels: Record<string, string> = {
  high: "高置信分类",
  medium: "中置信分类",
  low: "低置信分类",
};

const sicGroupLabels = {
  papers: { label: "SiC / 论文", href: "/sic#sic-group-papers", channel: "论文发现" },
  archive: { label: "SiC / 档案", href: "/sic#sic-group-archive", channel: "官方技术档案" },
  courses: { label: "SiC / 课程", href: "/sic#sic-group-courses", channel: "课程与讲座" },
  podcasts: { label: "SiC / 播客", href: "/sic#sic-group-podcasts", channel: "长对谈" },
} as const;

const sicMethods: Record<string, MethodDefinition> = {
  feed: {
    id: "rss-atom",
    label: "RSS / Atom",
    description: "统一读取官方文章、YouTube 频道和播客订阅流；载体不同，但底层都是结构化 Feed。",
  },
  page: {
    id: "official-page-index",
    label: "官方页面 / 日期索引",
    description: "读取官方论文页、课程目录、Release Notes 与日期化更新页，不做整站无差别抓取。",
  },
  sitemap: {
    id: "official-sitemap",
    label: "官方 Sitemap",
    description: "用于没有一方 RSS 的机构，只追踪获批路径中的正式发布页面。",
  },
  github: {
    id: "github-api",
    label: "GitHub API",
    description: "读取公开维护项目的结构化提交记录，形成稳定的研究发现线。",
  },
};

function informationOrigin(source: InformationSource) {
  if (source.channelType === "x") return `https://x.com/${source.channelIdentifier.replace(/^@/, "")}`;
  if (source.channelType === "github-release") return `https://github.com/${source.channelIdentifier}`;
  if (source.channelType === "github-user-events") return `https://github.com/${source.channelIdentifier}`;
  return source.endpoint;
}

function informationNature(source: InformationSource) {
  return [
    publisherKinds[source.publisherKind] ?? source.publisherKind,
    source.role,
  ].filter(Boolean).join(" · ");
}

function informationProvenance(source: InformationSource) {
  const registry = source.discoveredFrom[0];
  const registryLabel = registry ? `${registry.repository} / ${registry.path}` : "项目运行清单";
  return source.aggregator
    ? `经 ${source.aggregator} 转接；清单来自 ${registryLabel}`
    : `发布方或平台直连；清单来自 ${registryLabel}`;
}

function informationItem(source: InformationSource): SourceCatalogItem {
  const method = informationMethods[source.connector] ?? {
    id: source.connector,
    label: source.connector,
    description: "结构化公开接口。",
  };
  const projectDestination = source.channelType === "github-trending";
  return {
    id: source.id,
    name: source.name,
    publisher: source.name,
    sectionId: "information-flow",
    methodId: method.id,
    methodLabel: method.label,
    channelLabel: informationChannelLabels[source.channelType] ?? source.channelType,
    destinationLabel: projectDestination ? "首页 / SiC 项目趋势" : "信息流 / 资讯瀑布与事件簿",
    destinationHref: projectDestination ? "/sic#sic-rankings" : "/feed",
    sourceUrl: informationOrigin(source),
    endpointUrl: source.endpoint,
    purpose: informationPurposes[source.channelType] ?? "为信息流提供结构化公开更新。",
    nature: informationNature(source),
    evidenceLabel: [
      evidenceNatures[source.evidenceNature] ?? source.evidenceNature,
      confidenceLabels[source.classificationConfidence] ?? source.classificationConfidence,
    ].join(" · "),
    provenance: informationProvenance(source),
  };
}

function sicMethod(kind: string) {
  if (["official_rss", "official_atom", "official_channel", "hosted_podcast"].includes(kind)) return sicMethods.feed;
  if (kind === "official_sitemap") return sicMethods.sitemap;
  if (kind === "official_api") return sicMethods.github;
  return sicMethods.page;
}

function sicItem(source: SicSource): SourceCatalogItem {
  const method = sicMethod(source.kind);
  const destination = sicGroupLabels[source.group];
  const official = source.kind.startsWith("official_");
  return {
    id: `sic:${source.id}`,
    name: source.name,
    publisher: source.publisher,
    sectionId: "sic-library",
    methodId: method.id,
    methodLabel: method.label,
    channelLabel: destination.channel,
    destinationLabel: destination.label,
    destinationHref: destination.href,
    sourceUrl: source.homeUrl,
    endpointUrl: source.endpoint,
    purpose: source.rationale,
    nature: official ? "发布方官方固定源" : "主理人权威固定源",
    evidenceLabel: official ? "一手技术 / 教学材料" : "策展准入的长内容来源",
    provenance: "Vault2077 SiC 固定来源注册表",
  };
}

const rankingSources: Array<Omit<SourceCatalogItem, "sectionId">> = [
  {
    id: "ranking:hugging-face",
    name: "Hugging Face Models",
    publisher: "Hugging Face",
    methodId: "official-model-api",
    methodLabel: "官方模型 API",
    channelLabel: "模型下载趋势",
    destinationLabel: "SiC / Hugging Face 下载排行",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://huggingface.co/models",
    endpointUrl: "https://huggingface.co/api/models",
    purpose: "保存模型累计下载快照，通过相隔 7 日的同模型差值计算周增长。",
    nature: "模型平台官方接口",
    evidenceLabel: "确定性榜单数据 · 不调用 LLM",
    provenance: "Hugging Face 官方公开 API",
  },
  {
    id: "ranking:openrouter",
    name: "OpenRouter Top Weekly",
    publisher: "OpenRouter",
    methodId: "official-model-api",
    methodLabel: "官方模型 API",
    channelLabel: "模型调用趋势",
    destinationLabel: "SiC / OpenRouter 调用排行",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://openrouter.ai/rankings",
    endpointUrl: "https://openrouter.ai/api/v1/models?sort=top-weekly",
    purpose: "展示 OpenRouter 官方周使用排序，只代表经该平台路由的模型调用。",
    nature: "模型路由平台官方接口",
    evidenceLabel: "官方排序 · 不调用 LLM",
    provenance: "OpenRouter 官方公开 API",
  },
  {
    id: "ranking:github-trending",
    name: "GitHub Trending",
    publisher: "GitHub",
    methodId: "github-trend-data",
    methodLabel: "GitHub 趋势 / 事件数据",
    channelLabel: "官方 Trending",
    destinationLabel: "SiC / GitHub Trending",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://github.com/trending",
    endpointUrl: "https://github.com/trending",
    purpose: "保留 GitHub Trending 当期公开顺序，作为即时开源热度镜像。",
    nature: "平台公开趋势页",
    evidenceLabel: "发现性排序 · 不调用 LLM",
    provenance: "GitHub 公开 Trending 页面",
  },
  {
    id: "ranking:github-24h",
    name: "GitHub 24H Velocity",
    publisher: "GH Archive / Google BigQuery",
    methodId: "github-trend-data",
    methodLabel: "GitHub 趋势 / 事件数据",
    channelLabel: "24 小时新增",
    destinationLabel: "SiC / GitHub 24H",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://www.gharchive.org/",
    endpointUrl: "https://console.cloud.google.com/bigquery?p=githubarchive",
    purpose: "基于 GitHub 公共事件归档统计仓库近 24 小时新增关注，观察短期速度。",
    nature: "公共事件归档与聚合查询",
    evidenceLabel: "确定性统计 · 不调用 LLM",
    provenance: "GH Archive 数据集 / Google BigQuery",
  },
  {
    id: "ranking:github-7d",
    name: "GitHub 7D Velocity",
    publisher: "GH Archive / Google BigQuery",
    methodId: "github-trend-data",
    methodLabel: "GitHub 趋势 / 事件数据",
    channelLabel: "7 日新增",
    destinationLabel: "SiC / GitHub 7D",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://www.gharchive.org/",
    endpointUrl: "https://console.cloud.google.com/bigquery?p=githubarchive",
    purpose: "基于 GitHub 公共事件归档统计仓库近 7 日新增关注，降低单日波动。",
    nature: "公共事件归档与聚合查询",
    evidenceLabel: "确定性统计 · 不调用 LLM",
    provenance: "GH Archive 数据集 / Google BigQuery",
  },
  {
    id: "ranking:skills",
    name: "Agent Skills",
    publisher: "skills.sh / Smithery",
    methodId: "extension-market-api",
    methodLabel: "扩展市场 API",
    channelLabel: "Skills 采用趋势",
    destinationLabel: "SiC / Skills 榜",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://skills.sh/",
    endpointUrl: "https://skills.sh/api/v1/skills",
    purpose: "读取策展与全量采用数据，展示常用 Skill，并通过快照差值计算增长。",
    nature: "扩展市场公开榜单",
    evidenceLabel: "采用量快照 · 不调用 LLM",
    provenance: "skills.sh；不可用时可由 Smithery 补充",
  },
  {
    id: "ranking:mcps",
    name: "MCP Servers",
    publisher: "Smithery",
    methodId: "extension-market-api",
    methodLabel: "扩展市场 API",
    channelLabel: "MCP 采用趋势",
    destinationLabel: "SiC / MCP 榜",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://smithery.ai/",
    endpointUrl: "https://registry.smithery.ai/servers",
    purpose: "读取已上架 MCP Server 的采用数据，展示常用服务并计算快照增长。",
    nature: "MCP 市场注册表",
    evidenceLabel: "采用量快照 · 不调用 LLM",
    provenance: "Smithery Registry API",
  },
];

function groupMethods(
  sources: SourceCatalogItem[],
  definitions: Record<string, MethodDefinition>,
): SourceCatalogMethod[] {
  const byMethod = new Map<string, SourceCatalogItem[]>();
  for (const source of sources) {
    const items = byMethod.get(source.methodId) ?? [];
    items.push(source);
    byMethod.set(source.methodId, items);
  }
  return [...byMethod.entries()]
    .map(([id, items]) => {
      const definition = Object.values(definitions).find((item) => item.id === id);
      return {
        id,
        label: definition?.label ?? items[0].methodLabel,
        description: definition?.description ?? "结构化公开数据接口。",
        sources: items.sort((left, right) => left.name.localeCompare(right.name, "zh-CN")),
      };
    })
    .sort((left, right) => right.sources.length - left.sources.length || left.label.localeCompare(right.label, "zh-CN"));
}

function section(
  id: SourceCatalogSectionId,
  code: string,
  label: string,
  description: string,
  destinationHref: string,
  sources: SourceCatalogItem[],
  definitions: Record<string, MethodDefinition>,
): SourceCatalogSection {
  return { id, code, label, description, destinationHref, methods: groupMethods(sources, definitions) };
}

export function buildSourceCatalog(sourceBundle: SourceBundle, sicSources: SicSource[]): SourceCatalog {
  const information = sourceBundle.sources.map(informationItem);
  const sic = sicSources
    .filter((source) => source.status === "approved")
    .map(sicItem);
  const rankings = rankingSources.map((source) => ({ ...source, sectionId: "sic-rankings" as const }));
  const rankingMethods = Object.fromEntries(
    rankingSources.map((source) => [source.methodId, {
      id: source.methodId,
      label: source.methodLabel,
      description: source.methodId === "official-model-api"
        ? "读取模型平台官方排序或累计指标，保存为可比较快照。"
        : source.methodId === "github-trend-data"
          ? "读取 GitHub 公开趋势与事件归档，生成不同时间尺度的开源速度榜。"
          : "读取 Skill 与 MCP 市场采用数据，形成当前采用和增长榜。",
    }]),
  );
  const sections = [
    section(
      "information-flow",
      "01 / INTEL",
      "信息流",
      "文章、公开动态、社区信号和开源版本先进入资讯瀑布；达到多来源阈值后再沉淀为事件。",
      "/feed",
      information,
      informationMethods,
    ),
    section(
      "sic-library",
      "02 / LIBRARY",
      "SiC 固定内容源",
      "论文、官方技术档案、课程与长对谈进入 SiC 阅读区，由境内模型完成中文编辑。",
      "/sic",
      sic,
      sicMethods,
    ),
    section(
      "sic-rankings",
      "03 / SIGNAL",
      "SiC 榜单与生态信号",
      "模型、GitHub、Skill 与 MCP 榜单使用结构化快照和确定性计算，不经过 LLM 改写。",
      "/sic#sic-rankings",
      rankings,
      rankingMethods,
    ),
  ];
  return {
    generatedAt: sourceBundle.generatedAt,
    registryRevision: sourceBundle.revision,
    total: sections.reduce((total, item) => total + item.methods.reduce((count, method) => count + method.sources.length, 0), 0),
    sections,
  };
}
