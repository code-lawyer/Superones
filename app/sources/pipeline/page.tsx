import type { Metadata } from "next";
import Link from "next/link";
import sicRegistry from "@/config/sic-source-registry.json";
import sourceBundle from "@/config/source-bundle.json";
import styles from "./pipeline-sources.module.css";

export const metadata: Metadata = {
  title: "境外信息管线清单",
  description: "按采集通道与产品栏目核对 Vault2077 当前实际接入的境外公开来源。",
  robots: {
    index: false,
    follow: false,
  },
};

type BundleSource = {
  id: string;
  name: string;
  endpoint: string;
  connector: string;
  sourceStream?: string;
  contentGroup?: "information" | "roadside" | "documents";
  channelType?: string;
  channelIdentifier?: string;
  publisherKind?: string;
  originPlatform?: string;
};

type SicSource = {
  id: string;
  group: "papers" | "documents" | "courses" | "podcasts";
  status: "pending_review" | "approved" | "paused" | "retired" | "rejected";
  name: string;
  publisher: string;
  kind: string;
  homeUrl: string;
  endpoint: string;
  rationale: string;
};

type DisplaySource = {
  id: string;
  name: string;
  href: string;
  method: string;
  note?: string;
};

const bundleSources = (sourceBundle.sources as BundleSource[])
  .slice()
  .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
const approvedSicSources = (sicRegistry.sources as SicSource[])
  .filter((source) => source.status === "approved")
  .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));

const informationSources = bundleSources.filter((source) => source.contentGroup === "information");
const editorialSources = informationSources.filter((source) => source.publisherKind === "editorial_media");
const institutionalNewsSources = informationSources.filter((source) => source.channelType === "official-news");
const releaseSources = informationSources.filter((source) => source.channelType === "github-release");
const roadsideSources = bundleSources.filter((source) => source.contentGroup === "roadside");
const sicDocuments = approvedSicSources.filter((source) => source.group === "documents");
const sicPapers = approvedSicSources.filter((source) => source.group === "papers");
const sicCourses = approvedSicSources.filter((source) => source.group === "courses");
const sicPodcasts = approvedSicSources.filter((source) => source.group === "podcasts");

const methodLabels: Record<string, string> = {
  rss: "RSS / Atom",
  sitemap: "官方 Sitemap",
  "dated-index": "日期索引",
  "github-releases": "GitHub Releases API",
  hackernews: "Hacker News API",
  json: "公开 JSON",
  official_api: "官方 API",
  official_rss: "官方 RSS",
  official_atom: "官方 Atom",
  official_sitemap: "官方 Sitemap",
  official_dated_index: "日期索引",
  official_catalog: "官方目录",
  official_channel: "官方频道 Feed",
  hosted_podcast: "播客 Feed",
};

function bundleHref(source: BundleSource) {
  if (source.channelType === "x" && source.channelIdentifier) {
    return `https://x.com/${source.channelIdentifier.replace(/^@/, "")}`;
  }
  if (source.channelType === "github-release" && source.channelIdentifier) {
    return `https://github.com/${source.channelIdentifier}`;
  }
  if (source.name === "Hacker News") return "https://news.ycombinator.com/";
  if (source.name === "Lobsters") return "https://lobste.rs/";
  return source.endpoint;
}

function bundleDisplay(source: BundleSource): DisplaySource {
  return {
    id: source.id,
    name: source.name,
    href: bundleHref(source),
    method: methodLabels[source.connector] ?? source.connector,
  };
}

function sicDisplay(source: SicSource): DisplaySource {
  return {
    id: `sic:${source.id}`,
    name: source.name,
    href: source.homeUrl,
    method: methodLabels[source.kind] ?? source.kind,
    note: source.publisher,
  };
}

const rankingSources: DisplaySource[] = [
  {
    id: "ranking:github:today",
    name: "GitHub Trending · Today",
    href: "https://github.com/trending?since=daily",
    method: "公开趋势页",
  },
  {
    id: "ranking:github:week",
    name: "GitHub Trending · This week",
    href: "https://github.com/trending?since=weekly",
    method: "公开趋势页",
  },
  {
    id: "ranking:github:month",
    name: "GitHub Trending · This month",
    href: "https://github.com/trending?since=monthly",
    method: "公开趋势页",
  },
  {
    id: "ranking:hugging-face",
    name: "Hugging Face Trending",
    href: "https://huggingface.co/models?sort=trending",
    method: "官方模型 API",
  },
  {
    id: "ranking:openrouter",
    name: "OpenRouter Top Weekly",
    href: "https://openrouter.ai/models?order=top-weekly",
    method: "官方模型 API",
  },
  {
    id: "ranking:skills:all-time",
    name: "skills.sh · All Time",
    href: "https://skills.sh/",
    method: "公开榜单",
  },
  {
    id: "ranking:skills:trending",
    name: "skills.sh · Trending 24h",
    href: "https://skills.sh/trending",
    method: "公开榜单",
  },
  {
    id: "ranking:skills:hot",
    name: "skills.sh · Hot",
    href: "https://skills.sh/hot",
    method: "公开榜单",
  },
];

const lanes = [
  {
    id: "information",
    code: "INFORMATION",
    title: "正式资讯",
    count: informationSources.length,
    cadence: "北京时间偶数小时 :05",
    processing: "境内翻译、摘要、事件匹配",
    destinations: [
      `第三方编辑来源 ${editorialSources.length}`,
      `机构新闻 ${institutionalNewsSources.length}`,
      `项目重大版本 ${releaseSources.length}`,
      "→ Vault 资讯瀑布与事件证据",
    ],
  },
  {
    id: "roadside",
    code: "ROADSIDE",
    title: "个人与社区",
    count: roadsideSources.length,
    cadence: "北京时间偶数小时 :55",
    processing: "境内翻译、摘要、事件匹配",
    destinations: [
      `X / 个人博客 / 社区 ${roadsideSources.length}`,
      "→ Vault 路边社",
    ],
  },
  {
    id: "sic",
    code: "SIC",
    title: "学院固定内容",
    count: approvedSicSources.length,
    cadence: "北京时间 07:25、19:25",
    processing: "境内编辑说明",
    destinations: [
      `档案 ${sicDocuments.length}`,
      `论文 ${sicPapers.length}`,
      `课程 ${sicCourses.length}`,
      `播客 ${sicPodcasts.length}`,
      "→ SiC 最新内容",
    ],
  },
  {
    id: "rankings",
    code: "RANKINGS",
    title: "平台原生榜",
    count: rankingSources.length,
    cadence: "目标每小时；当前每日两次",
    processing: "保留平台原序，不经过 LLM",
    destinations: [
      `GitHub 3`,
      `模型平台 2`,
      `Skill 市场 3`,
      "→ SiC 榜单",
    ],
    warning: true,
  },
] as const;

const sourceGroups = [
  {
    id: "vault-information",
    number: "V-01",
    product: "VAULT",
    title: "资讯瀑布",
    count: informationSources.length,
    lane: "information",
    description: "只收新闻型内容：第三方报道、机构正式新闻和开源项目重大版本。研究、方法论和深度工程材料不在这里重复出现。",
    subsets: [
      {
        title: "第三方编辑来源",
        description: "有明确编辑责任主体的报道、通讯与分析。",
        sources: editorialSources.map(bundleDisplay),
      },
      {
        title: "机构正式新闻",
        description: "从单独批准的官方新闻入口读取公告、产品发布、公司变化与公共回应。",
        sources: institutionalNewsSources.map(bundleDisplay),
      },
      {
        title: "开源项目重大版本",
        description: "从获准仓库的 GitHub Releases API 读取正式版本；普通 commit 与例行活动不进入资讯瀑布。",
        sources: releaseSources.map(bundleDisplay),
      },
    ],
  },
  {
    id: "vault-roadside",
    number: "V-02",
    product: "VAULT",
    title: "路边社",
    count: roadsideSources.length,
    lane: "roadside",
    description: "收自然人的公开表达、个人博客与社区原生条目。Hacker News 和 Lobsters 对条目、排序与讨论入口负责；外链只展示，不递归抓取。",
    subsets: [
      {
        title: "X 账号",
        description: "按人物准入，当前通过 RSS 转接读取；X handle 才是根源身份。",
        sources: roadsideSources
          .filter((source) => source.channelType === "x")
          .map(bundleDisplay),
      },
      {
        title: "个人博客",
        description: "直接读取作者自己的公开 Feed。",
        sources: roadsideSources
          .filter((source) => source.publisherKind === "person" && source.channelType !== "x")
          .map(bundleDisplay),
      },
      {
        title: "社区主题",
        description: "社区条目本身是一手记录；保留标题、提交者、讨论入口和可选外链，但不抓取外链正文，也不进入发现—晋升中间态。",
        sources: roadsideSources
          .filter((source) => source.channelType === "community")
          .map(bundleDisplay),
      },
    ],
  },
  {
    id: "sic-documents",
    number: "S-01",
    product: "SIC",
    title: "档案",
    count: sicDocuments.length,
    lane: "sic",
    description: "只收机构的深度研究、技术报告、系统卡、方法论与长篇工程材料；新闻稿、例行 Release 和 Changelog 不进入档案。",
    subsets: [
      {
        title: "官方固定源",
        description: "按边界清晰的深度发布通道准入；宽泛混合 Feed 在能稳定筛分前保持待审。",
        sources: sicDocuments.map(sicDisplay),
      },
    ],
  },
  {
    id: "sic-papers",
    number: "S-02",
    product: "SIC",
    title: "论文",
    count: sicPapers.length,
    lane: "sic",
    description: "Hugging Face 负责发现每日论文，标题、作者、日期和摘要最终回到 arXiv 核验。",
    subsets: [
      {
        title: "论文发现入口",
        description: "当前只有一个正式入口，避免多个榜单重复发现同一论文。",
        sources: sicPapers.map(sicDisplay),
      },
    ],
  },
  {
    id: "sic-courses",
    number: "S-03",
    product: "SIC",
    title: "课程",
    count: sicCourses.length,
    lane: "sic",
    description: "系统课程、公开讲座、研究演讲和工程演示。YouTube 只读取获准官方频道的 Feed 元数据与原始链接，不下载或转录视频。",
    subsets: [
      {
        title: "官方课程与频道",
        description: "课程目录或频道级固定接入。",
        sources: sicCourses.map(sicDisplay),
      },
    ],
  },
  {
    id: "sic-podcasts",
    number: "S-04",
    product: "SIC",
    title: "播客",
    count: sicPodcasts.length,
    lane: "sic",
    description: "按主理人与整档节目准入，读取节目 Feed 的新单集，不根据某一期嘉宾临时决定收录。",
    subsets: [
      {
        title: "整档节目",
        description: "只获取节目元数据、说明和原始链接。",
        sources: sicPodcasts.map(sicDisplay),
      },
    ],
  },
  {
    id: "sic-rankings",
    number: "S-05",
    product: "SIC",
    title: "平台原生榜",
    count: rankingSources.length,
    lane: "rankings",
    description: "忠实保留平台公开定义的顺序与视图，不跨平台重排，不用本地快照重新计算“增长榜”，也不经过 LLM。",
    subsets: [
      {
        title: "八个公开视图",
        description: "一个平台的多个时间视图分别计为独立榜单来源。",
        sources: rankingSources,
      },
    ],
  },
] as const;

const routeBindingCount = bundleSources.length + approvedSicSources.length + rankingSources.length;
const uniqueDisplayCount = routeBindingCount;

function SourceGrid({ sources }: { sources: readonly DisplaySource[] }) {
  return (
    <div className={styles.sourceGrid}>
      {sources.map((source) => (
        <a
          className={styles.source}
          href={source.href}
          key={source.id}
          rel="noreferrer"
          target="_blank"
        >
          <span className={styles.sourceName}>{source.name}</span>
          <span className={styles.sourceMeta}>
            {source.note ? `${source.note} · ` : ""}
            {source.method}
          </span>
          <span className={styles.outbound} aria-hidden="true">↗</span>
        </a>
      ))}
    </div>
  );
}

export default function PipelineSourcesPage() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTopline}>
          <p>INBOUND MANIFEST / 当前运行边界</p>
          <nav aria-label="来源页面导航">
            <Link href="/sources">逐源目录</Link>
            <Link href="/pipeline">运行实况</Link>
          </nav>
        </div>
        <div className={styles.heroGrid}>
          <div>
            <h1>境外拉什么，<br />最后落到哪里</h1>
            <p className={styles.lead}>
              这不是候选池，也不是未来愿望清单。下面按当前注册表和执行代码，展开四条采集通道、
              七个产品栏目与每一个已接入的公开来源。
            </p>
          </div>
          <dl className={styles.manifest}>
            <div>
              <dt>采集通道</dt>
              <dd>4</dd>
            </div>
            <div>
              <dt>产品栏目</dt>
              <dd>{sourceGroups.length}</dd>
            </div>
            <div>
              <dt>不同来源 / 视图</dt>
              <dd>{uniqueDisplayCount}</dd>
            </div>
            <div>
              <dt>通道—来源绑定</dt>
              <dd>{routeBindingCount}</dd>
            </div>
          </dl>
        </div>
        <div className={styles.revision}>
          <span>来源版本 {sourceBundle.revision}</span>
          <span>SiC 注册表 v{sicRegistry.version}</span>
          <span>全部来源执行单一主去向</span>
        </div>
      </header>

      <section className={styles.thesis} aria-labelledby="thesis-title">
        <p>THE DECISION IN ONE SENTENCE</p>
        <h2 id="thesis-title">
          境外侧只负责忠实读取公开材料；<br />
          每条原始内容只有一个主去向；新闻进 Vault，深度材料进 SiC。
        </h2>
      </section>

      <section className={styles.laneBoard} aria-labelledby="lanes-title">
        <header className={styles.sectionHeader}>
          <div>
            <p>01 / ACQUISITION LANES</p>
            <h2 id="lanes-title">先看四条管线</h2>
          </div>
          <p>通道是运行和重试边界，不等于前台栏目；同一原始内容不会再由两条通道重复采集或重复展示。</p>
        </header>
        <div className={styles.lanes}>
          {lanes.map((lane) => (
            <article className={styles.lane} data-lane={lane.id} key={lane.id}>
              <div className={styles.laneIdentity}>
                <span>{lane.code}</span>
                <strong>{lane.count}</strong>
              </div>
              <div className={styles.laneDescription}>
                <h3>{lane.title}</h3>
                <p>{lane.cadence}</p>
                <small>{lane.processing}</small>
              </div>
              <div className={styles.routeRail} aria-hidden="true">
                <i />
              </div>
              <ul className={styles.destinations}>
                {lane.destinations.map((destination) => (
                  <li key={destination}>{destination}</li>
                ))}
              </ul>
              {"warning" in lane && lane.warning
                ? <span className={styles.warning}>调度尚未达到规格</span>
                : null}
            </article>
          ))}
        </div>
      </section>

      <section className={styles.columns} aria-labelledby="columns-title">
        <header className={styles.sectionHeader}>
          <div>
            <p>02 / PRODUCT COLUMNS</p>
            <h2 id="columns-title">再按栏目查清单</h2>
          </div>
          <p>这里按用户最后看到的位置组织。数字表示当前正式接入数量；来源边界不清或同时涵盖新闻与深度材料的混合 Feed 暂不进入生产。</p>
        </header>
        <nav className={styles.columnIndex} aria-label="栏目索引">
          {sourceGroups.map((group) => (
            <a href={`#${group.id}`} key={group.id}>
              <span>{group.number}</span>
              <strong>{group.title}</strong>
              <i>{group.count}</i>
            </a>
          ))}
        </nav>
        <div className={styles.columnList}>
          {sourceGroups.map((group) => (
            <article className={styles.column} id={group.id} key={group.id}>
              <header className={styles.columnHeader}>
                <div className={styles.columnNumber}>
                  <span>{group.number}</span>
                  <small>{group.product}</small>
                </div>
                <div>
                  <p>{group.lane.toUpperCase()} LANE</p>
                  <h3>{group.title}</h3>
                </div>
                <strong>{group.count}</strong>
                <p>{group.description}</p>
              </header>
              <div className={styles.subsets}>
                {group.subsets.map((subset) => (
                  <section className={styles.subset} key={subset.title}>
                    <header>
                      <h4>{subset.title}</h4>
                      <p>{subset.description}</p>
                      <span>{subset.sources.length} SOURCES</span>
                    </header>
                    <SourceGrid sources={subset.sources} />
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.exclusions} aria-labelledby="exclusions-title">
        <header className={styles.sectionHeader}>
          <div>
            <p>03 / NOT AN OVERSEAS FEED</p>
            <h2 id="exclusions-title">这些不从境外内容管线拉</h2>
          </div>
          <p>把非采集对象说清楚，才能避免后续继续扩张出第二套管线。</p>
        </header>
        <div className={styles.exclusionGrid}>
          <article>
            <span>DERIVED</span>
            <h3>事件簿</h3>
            <p>事件是境内处理根据资讯与路边社证据形成的意义单元，不是一个外部来源。</p>
          </article>
          <article>
            <span>DIRECT READ</span>
            <h3>Frontier</h3>
            <p>只按当前参赛名单读取已知 GitHub 仓库；交互核验走境内服务端短时直读，失败进入异步回退。</p>
          </article>
          <article>
            <span>BUSINESS DATA</span>
            <h3>OPC</h3>
            <p>服务、顾问和履约数据属于境内业务事实，不进入公开内容采集器。</p>
          </article>
          <article>
            <span>EXCLUDED</span>
            <h3>大陆来源平台</h3>
            <p>微信公众号、知乎、微博、B 站等不进入生产来源组合；代理转发也不会改变原始平台身份。</p>
          </article>
        </div>
      </section>

      <section className={styles.decisions} aria-labelledby="decisions-title">
        <header className={styles.sectionHeader}>
          <div>
            <p>04 / GOVERNANCE STATUS</p>
            <h2 id="decisions-title">已统一的规则与剩余欠账</h2>
          </div>
          <p>前三项已经写进来源注册表、采集代码和项目规范；后两项仍是下一阶段的运行可靠性工作。</p>
        </header>
        <ol>
          <li>
            <span>01</span>
            <div>
              <h3>机构内容实行单一主去向</h3>
              <p>新闻、公告和重大版本进入 Vault 资讯瀑布；深度研究、技术报告与方法论进入 SiC 档案。同一原始内容不重复采集、不双重发布。</p>
            </div>
            <strong>已统一</strong>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>混合机构 Feed 默认不准入</h3>
              <p>无法稳定区分新闻与深度材料的宽泛 Feed 保持待审；只有边界明确的新闻入口或深度发布入口才能进入生产。</p>
            </div>
            <strong>已统一</strong>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Hacker News 与 Lobsters 是社区一手来源</h3>
              <p>条目、排序和讨论入口作为社区自己的 canonical 记录；外链只作为引用字段保存，不回源抓正文，也不再生成发现候选。</p>
            </div>
            <strong>已统一</strong>
          </li>
          <li>
            <span>04</span>
            <div>
              <h3>榜单调度提高到每小时唤醒</h3>
              <p>规格要求每小时检查到期榜单，当前 GitHub Actions 仍是每日两次。建议上线闭环完成后立即调整。</p>
            </div>
            <strong>实现欠账</strong>
          </li>
          <li>
            <span>05</span>
            <div>
              <h3>X 转接必须有降级路径</h3>
              <p>34 个 X 来源目前集中依赖同一个 RSS 转接服务。建议保留权威 handle 清单，补充逐源健康度、熔断与可替换适配器。</p>
            </div>
            <strong>可靠性欠账</strong>
          </li>
        </ol>
      </section>
    </main>
  );
}
