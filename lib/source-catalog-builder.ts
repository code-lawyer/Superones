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
  sourceStream: string;
  contentGroup?: string;
  itemKind?: string;
  originPlatform: string;
  authorityTier: string | null;
};

type SourceBundle = {
  generatedAt: string;
  revision: string;
  counts: {
    statements: number;
    xCandidates: number;
    xRunnableCandidates: number;
    xExcludedFromRuntime: number;
    xDuplicateDiscoveriesMerged: number;
  };
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
    description: "以机器可读订阅流接入文章和播客；X 公开动态已从资讯瀑布分离。",
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

const statementMethods: Record<string, MethodDefinition> = {
  rss: {
    id: "x-rss-relay",
    label: "X 账号 / RSS 转接",
    description: "根源平台是 X；RSS 只是境外采集的传输方式。账号按标准化 handle 去重，只保留权威政策明确准入的来源。",
  },
};

const authorityTierLabels: Record<string, string> = {
  authoritative_person: "高权威个人",
  editorial_voice: "专业编辑 / 媒体",
  official_organization: "机构官方账号",
  official_project: "项目官方账号",
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
  community_user: "未核验社区身份",
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
  documents: { label: "SiC / 档案", href: "/sic#sic-group-documents", channel: "深度技术档案" },
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

function statementProvenance(source: InformationSource) {
  if (source.originPlatform !== "x") {
    const registry = source.discoveredFrom[0];
    const registryLabel = registry ? `${registry.repository} / ${registry.path}` : "项目运行清单";
    return source.channelType === "community"
      ? `社区原生条目与讨论入口直连；外链仅作为条目字段保存，不递归抓取；清单来自 ${registryLabel}`
      : `个人原始发布直连；清单来自 ${registryLabel}`;
  }
  const paths = source.discoveredFrom.map((item) => `${item.repository} / ${item.path}`);
  const merged = paths.length > 1 ? `；已将 ${paths.length} 条目录声明合并为一个账号` : "";
  return `根源为 X @${source.channelIdentifier}；经 ${source.aggregator ?? "RSS 转接"} 传输；目录来自 ${paths.join("、")}${merged}`;
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
    sectionId: source.contentGroup === "documents" ? "documents" : "information-flow",
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

function statementItem(source: InformationSource): SourceCatalogItem {
  const method = source.originPlatform === "x"
    ? statementMethods[source.connector] ?? statementMethods.rss
    : informationMethods[source.connector] ?? {
        id: source.connector,
        label: source.connector,
        description: "个人或社区原始发布的结构化公开入口。",
      };
  const authorityLabel = source.originPlatform === "x"
    ? authorityTierLabels[source.authorityTier ?? ""] ?? "高权威自然人"
    : source.publisherKind === "person"
      ? "个人博客"
      : "社区原生主题";
  const purpose = source.publisherKind === "person"
    ? "追踪具有一手角色或长期专业权威的人物公开发言；多条独立观点可以形成事件，也可以与资讯事件归并。"
    : source.publisherKind === "editorial_media"
      ? "追踪专业编辑与行业媒体在 X 上发布的即时观察，形成独立观点事件候选。"
      : "追踪机构或项目的官方 X 声明，作为与资讯瀑布平级的事件输入。";
  return {
    id: source.id,
    name: source.name,
    publisher: source.name,
    sectionId: "roadside",
    methodId: method.id,
    methodLabel: method.label,
    channelLabel: authorityLabel,
    destinationLabel: "Vault 信息流 / 路边社",
    destinationHref: "/feed",
    sourceUrl: informationOrigin(source),
    endpointUrl: source.endpoint,
    purpose,
    nature: authorityLabel,
    evidenceLabel: [
      evidenceNatures[source.evidenceNature] ?? source.evidenceNature,
      confidenceLabels[source.classificationConfidence] ?? source.classificationConfidence,
    ].join(" · "),
    provenance: statementProvenance(source),
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
    sectionId: source.group,
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
    name: "Hugging Face Trending",
    publisher: "Hugging Face",
    methodId: "official-model-api",
    methodLabel: "官方模型 API",
    channelLabel: "官方 Trending",
    destinationLabel: "SiC / Hugging Face Trending",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://huggingface.co/models?sort=trending",
    endpointUrl: "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=20",
    purpose: "直接保留 Hugging Face 官方 Trending 顺序，不计算下载差值。",
    nature: "模型平台官方接口",
    evidenceLabel: "平台原始顺序 · 不调用 LLM",
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
    sourceUrl: "https://openrouter.ai/models?order=top-weekly",
    endpointUrl: "https://openrouter.ai/api/v1/models?sort=top-weekly",
    purpose: "展示 OpenRouter 官方周使用排序，只代表经该平台路由的模型调用。",
    nature: "模型路由平台官方接口",
    evidenceLabel: "官方排序 · 不调用 LLM",
    provenance: "OpenRouter 官方公开 API",
  },
  {
    id: "ranking:github:today",
    name: "GitHub Trending Today",
    publisher: "GitHub",
    methodId: "github-trend-data",
    methodLabel: "GitHub 趋势 / 事件数据",
    channelLabel: "Today",
    destinationLabel: "SiC / GitHub Today",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://github.com/trending?since=daily",
    endpointUrl: "https://github.com/trending?since=daily",
    purpose: "直接保留 GitHub Trending Today 公开顺序。",
    nature: "平台公开趋势页",
    evidenceLabel: "发现性排序 · 不调用 LLM",
    provenance: "GitHub 公开 Trending 页面",
  },
  {
    id: "ranking:github:week",
    name: "GitHub Trending This week",
    publisher: "GitHub",
    methodId: "github-trend-data",
    methodLabel: "GitHub 趋势 / 事件数据",
    channelLabel: "This week",
    destinationLabel: "SiC / GitHub This week",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://github.com/trending?since=weekly",
    endpointUrl: "https://github.com/trending?since=weekly",
    purpose: "直接保留 GitHub Trending This week 公开顺序。",
    nature: "平台公开趋势页",
    evidenceLabel: "平台原始顺序 · 不调用 LLM",
    provenance: "GitHub 公开 Trending 页面",
  },
  {
    id: "ranking:github:month",
    name: "GitHub Trending This month",
    publisher: "GitHub",
    methodId: "github-trend-data",
    methodLabel: "GitHub 趋势 / 事件数据",
    channelLabel: "This month",
    destinationLabel: "SiC / GitHub This month",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://github.com/trending?since=monthly",
    endpointUrl: "https://github.com/trending?since=monthly",
    purpose: "直接保留 GitHub Trending This month 公开顺序。",
    nature: "平台公开趋势页",
    evidenceLabel: "平台原始顺序 · 不调用 LLM",
    provenance: "GitHub 公开 Trending 页面",
  },
  {
    id: "ranking:skills:all-time",
    name: "Agent Skills All Time",
    publisher: "skills.sh",
    methodId: "extension-market-api",
    methodLabel: "扩展市场 API",
    channelLabel: "All Time",
    destinationLabel: "SiC / Skill All Time",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://skills.sh/",
    endpointUrl: "https://skills.sh/",
    purpose: "直接保留 skills.sh All Time 榜公开顺序。",
    nature: "扩展市场公开榜单",
    evidenceLabel: "平台原始顺序 · 不调用 LLM",
    provenance: "skills.sh 公开榜单",
  },
  {
    id: "ranking:skills:trending-24h",
    name: "Agent Skills Trending 24h",
    publisher: "skills.sh",
    methodId: "extension-market-api",
    methodLabel: "扩展市场 API",
    channelLabel: "Trending 24h",
    destinationLabel: "SiC / Skill Trending 24h",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://skills.sh/trending",
    endpointUrl: "https://skills.sh/trending",
    purpose: "直接保留 skills.sh Trending 24h 榜公开顺序。",
    nature: "扩展市场公开榜单",
    evidenceLabel: "平台原始顺序 · 不调用 LLM",
    provenance: "skills.sh 公开榜单",
  },
  {
    id: "ranking:skills:hot",
    name: "Agent Skills Hot",
    publisher: "skills.sh",
    methodId: "extension-market-api",
    methodLabel: "扩展市场 API",
    channelLabel: "Hot",
    destinationLabel: "SiC / Skill Hot",
    destinationHref: "/sic#sic-rankings",
    sourceUrl: "https://skills.sh/hot",
    endpointUrl: "https://skills.sh/hot",
    purpose: "直接保留 skills.sh Hot 榜公开顺序。",
    nature: "扩展市场公开榜单",
    evidenceLabel: "平台原始顺序 · 不调用 LLM",
    provenance: "skills.sh 公开榜单",
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
  const information = sourceBundle.sources
    .filter((source) => source.contentGroup === "information")
    .map(informationItem);
  const roadside = sourceBundle.sources
    .filter((source) => source.contentGroup === "roadside" || ["roadside", "statements"].includes(source.sourceStream))
    .map(statementItem);
  const sic = sicSources
    .filter((source) => source.status === "approved")
    .map(sicItem);
  const documents = sic.filter((source) => source.sectionId === "documents");
  const papers = sic.filter((source) => source.sectionId === "papers");
  const podcasts = sic.filter((source) => source.sectionId === "podcasts");
  const courses = sic.filter((source) => source.sectionId === "courses");
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
      "INTEL / EDITORIAL",
      "资讯瀑布",
      "只收新闻型内容：第三方完整报道，以及机构的正式公告、重大发布和时效性更新；可参与事件编排。",
      "/feed",
      information,
      informationMethods,
    ),
    section(
      "roadside",
      "ROADSIDE / PEOPLE",
      "路边社",
      "自然人 X 言论、个人博客和社区原生条目。Hacker News 与 Lobsters 对其条目、排序和讨论入口负责；外链只展示，不递归抓取。",
      "/feed",
      roadside,
      statementMethods,
    ),
    section(
      "documents",
      "DOCUMENTS / FIRST PARTY",
      "档案",
      "机构的深度研究、技术报告、系统卡、方法论与长篇工程材料；不收新闻稿、例行 Release 或 Changelog，也不重复进入资讯瀑布。",
      "/sic#sic-group-documents",
      documents,
      informationMethods,
    ),
    section(
      "papers",
      "PAPERS / VERIFIED",
      "论文",
      "Hugging Face Daily Papers 仅负责发现，标题、作者、日期和摘要以 arXiv 核验结果为准。",
      "/sic#sic-group-papers",
      papers,
      sicMethods,
    ),
    section(
      "podcasts",
      "PODCASTS / EPISODES",
      "播客",
      "正式播客 Feed 发布的新节目，独立于个人言论和资讯瀑布。",
      "/sic#sic-group-podcasts",
      podcasts,
      sicMethods,
    ),
    section(
      "courses",
      "COURSES / SIC",
      "课程",
      "课程和公开教学内容继续保留在 SiC，不参与本轮事件归并。",
      "/sic#sic-group-courses",
      courses,
      sicMethods,
    ),
    section(
      "sic-rankings",
      "SIGNAL / RANKINGS",
      "SiC 榜单与生态信号",
      "GitHub、Hugging Face、OpenRouter 与 Skill 榜单直接保留平台公开顺序，不做本地增量推算，也不经过 LLM 改写。",
      "/sic#sic-rankings",
      rankings,
      rankingMethods,
    ),
  ];
  return {
    generatedAt: sourceBundle.generatedAt,
    registryRevision: sourceBundle.revision,
    total: sections.reduce((total, item) => total + item.methods.reduce((count, method) => count + method.sources.length, 0), 0),
    governance: {
      xCandidates: sourceBundle.counts.xCandidates,
      xRunnableCandidates: sourceBundle.counts.xRunnableCandidates,
      xActive: sourceBundle.counts.statements,
      xExcludedFromRuntime: sourceBundle.counts.xExcludedFromRuntime,
      xDuplicateDiscoveriesMerged: sourceBundle.counts.xDuplicateDiscoveriesMerged,
    },
    sections,
  };
}
