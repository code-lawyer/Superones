---
type: research
status: reference
updated: 2026-07-28
---

# `anbeime/skill` 源码研究

> 核验对象：[`anbeime/skill`](https://github.com/anbeime/skill)  
> 固定版本：[`f595e9637eb6ce160889a8434c1edf49b0b1fd0f`](https://github.com/anbeime/skill/tree/f595e9637eb6ce160889a8434c1edf49b0b1fd0f)（2026-07-28）  
> 证据范围：该版本的 README、源码、数据文件、GitHub Actions、部署配置，以及被比较产品的官方 API 文档。未使用第三方评测。

## 结论先行

`anbeime/skill` 不是一个拥有全网 Skill 搜索、排行榜或推荐算法的市场后端。它更准确的定位是：

1. 一个静态中文 Skill 资源展示站；
2. 一套从 Awesome List README 解析 Skill 条目的旧版 Python 爬虫；
3. 一套从 OpenAI Skills 和 VoltAgent Awesome List README 提取 GitHub 链接的每日“仓库源清单”任务；
4. 一个维护者手工整理的本地 Skill 库。

它没有调用 skills.sh 官方 API，也没有调用 SkillsMP API；没有安装量、下载量、增长率或真实 Trending 数据。仓库里没有可称为排行榜算法的实现，“五星推荐”是人工写入 JSON 和 HTML 的静态评级。

最关键的问题是，当前每日同步和网站主目录已经脱节：

- 每日 GitHub Action 只更新 `SKILL_SOURCES.json` 和 README；
- 网站声称的 182 条官方 Skill 仍来自 2026-02-02 的静态 `data/skills.json`；
- `public/skills.html` 不读取该 JSON，而是直接内嵌少量卡片和官方来源摘要；
- `public/local-skills.html` 期待 `independent_skills` / `skill_collections`，实际 JSON 却是 `metadata` / `categories` / `statistics` / `highlights`，两者 schema 不兼容。

因此，它不能替代 skills.sh 的 All-time、Trending、Hot API。对 Vault2077 的价值主要是“低成本 GitHub Actions + 静态快照”的工程思路，以及一份可作为种子、但必须重新验证的仓库 URL 列表。

## 1. 产品功能和定位

README 把项目描述为“技能商店”，声称有 182 个自动爬取的官方 Skill、61 个本地 Skill、每 24 小时更新，并支持分类和 JSON/CSV 导出。[README 的统计和功能说明](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/README.md#L237-L265)

源码实际包含四类产品面：

| 产品面 | 实际实现 | 判断 |
|---|---|---|
| 在线站点 | Vercel 托管 `public/` 下的纯静态 HTML、CSS、JSON | 静态目录，不是市场 API |
| 官方 Skill 目录 | 旧爬虫从 VoltAgent README 解析出的 182 条静态记录 | 数据已冻结在 2026-02-02 |
| 社区仓库聚合 | 每日从 OpenAI、VoltAgent 两个 README 提取 GitHub URL | 聚合的是仓库链接，不是完整 Skill |
| 本地 Skill 库 | 维护者本机目录与手工 JSON/HTML | 不属于“全网自动收集” |

首页还混合了 AI 伴侣和 N8N workflow 等资源，说明它本质上是维护者的综合资源门户，而不是只服务 Code Agent Skill 的规范化市场。[静态首页源码](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/public/index.html#L1-L30)

## 2. Skill 数据来源与采集流程

### 2.1 旧版：把 VoltAgent README 列表项解析成 Skill

旧版 `config.py` 只配置了一个来源：

```text
https://raw.githubusercontent.com/VoltAgent/awesome-agent-skills/main/README.md
```

证据见 [`config.py` 第 6–11 行](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/config.py#L6-L11)。

`crawler.py` 的流程是：

1. 用 `requests` 下载这个 raw README；
2. 把 `##` / `###` 标题当作当前分类；
3. 只处理以 `-` 开头的行；
4. 用正则解析 Markdown 链接中的名称、链接与尾部说明；
5. 写入 `name`、`description`、`link`、`category`、固定 `source` 和 `crawled_at`。

证据见 [`crawler.py` 下载逻辑](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/crawler.py#L27-L51)和[Markdown 正则解析逻辑](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/crawler.py#L53-L101)。

调度器随后只做必填字段校验、与旧列表比较、覆盖本地 JSON；可选地再把整批数据推给一个自建 API。[`scheduler.py` 的采集流水线](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/scheduler.py#L28-L69)

固定版本中的 [`data/skills.json`](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/data/skills.json#L1-L12) 和 `public/data/skills.json` 内容完全相同，记录：

- `total = 182`
- `updated_at = 2026-02-02T17:07:33.819738`
- 每条只有名称、描述、链接、分类、来源和抓取时间

它没有 Stars、安装量、下载量、更新时间、许可证、安全状态、兼容 Agent、内容 hash 或仓库活跃度。

### 2.2 当前每日任务：提取两个 README 里的 GitHub URL

当前 `.github/workflows/sync-skills.yml` 每天 02:00 UTC 执行 `scripts/sync_skills.py`，最后只提交 `SKILL_SOURCES.json` 和 `README.md`。[工作流触发与执行](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/.github/workflows/sync-skills.yml#L1-L37)、[提交文件范围](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/.github/workflows/sync-skills.yml#L39-L55)

同步脚本只有两个上游：

- `openai/skills` 的 README；
- `VoltAgent/awesome-agent-skills` 的 README。

见 [`UPSTREAM_SOURCES`](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/scripts/sync_skills.py#L15-L27)。

它不是 GitHub 全网搜索，也不遍历上游仓库文件树：

- VoltAgent 路径：用 `github.com/owner/repo` 正则提取 README 中出现的全部链接；
- OpenAI 路径：在 README 文本里寻找 `skills/.system/`、`.curated/`、`.experimental/` 字符串；
- 用 Python `set` 和最终的 `repo_id` 字典去重；
- 保存 `upstream_source`、`discovered_at` 和空的 `description`；
- 每次全量覆盖，不保存 `last_seen`、删除历史或来源证据快照。

证据见 [`extract_github_repos`](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/scripts/sync_skills.py#L46-L59)、[`extract_openai_skills`](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/scripts/sync_skills.py#L61-L77)和[全量合并保存过程](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/scripts/sync_skills.py#L180-L228)。

固定版本的 `SKILL_SOURCES.json` 有 155 个键，但这些键是“仓库或疑似仓库路径”，不是 155 个已验证 Skill。例如它包含 `en/copilot`、`user-attachments/assets` 等被简单 URL 正则误识别的路径；OpenAI 条目 `openai/skills/create-plan` 也被拼成普通 GitHub URL，而不是标准的 `tree/<ref>/<path>` 链接。[当前源清单](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/SKILL_SOURCES.json)

### 2.3 ClawHub：只同步 ClawHub 源码仓库信息

另一个每日工作流运行 `scripts/sync_clawhub.py`，只改 README。[ClawHub 工作流](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/.github/workflows/sync_clawhub.yml#L1-L55)

脚本调用：

- `git ls-remote` 获取 `openclaw/clawhub` 最新 commit；
- 未鉴权的 GitHub Contents API `/repos/openclaw/clawhub/contents/packages`，列出源码仓库 `packages/` 目录；
- raw README，摘录 CLI 说明。

见 [`get_clawhub_info`](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/scripts/sync_clawhub.py#L13-L68)。

它没有调用 ClawHub registry API，没有拉取 ClawHub Skill 目录、下载量、Stars 或排名。生成内容只是 README 中的“ClawHub 软件包和 CLI 命令”区块。[README 生成逻辑](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/scripts/sync_clawhub.py#L78-L126)

### 2.4 本地 Skill：手工数据

`data/local_skills.json` 记录维护者 Windows 本机 `D:\tool\skills`、备份路径、分类计数、API 需求统计、人工评分和 highlights。[本地数据 metadata 与分类](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/data/local_skills.json#L1-L27)、[人工评分与 highlights](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/data/local_skills.json#L147-L192)

它不是自动发现的公共市场数据，也不能证明对应 Skill 可从公开仓库安装。

## 3. 排行榜、推荐与搜索算法

### 排行榜

不存在。仓库没有根据 installs、downloads、Stars、时间窗口增长或用户行为进行排序的实现。`SKILL_SOURCES.json` 甚至没有这些字段。

### 推荐

“五星推荐”是手工选择：

- `data/local_skills.json` 直接写死 `rating: 5` 和 `core_skills`；
- `public/skills.html` 又把十张五星卡片静态写入 HTML；
- 没有评分函数、权重、评测、反馈数据或重算任务。

证据见[本地 JSON 的硬编码评分](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/data/local_skills.json#L147-L192)和[静态五星筛选标签](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/public/skills.html#L281-L305)。

### 搜索

主页面搜索是浏览器端对已经渲染的卡片执行小写子串匹配：

```text
name.includes(searchTerm) || description.includes(searchTerm)
```

随后按 `official`、`local`、`rating === 5` 过滤。没有分词、模糊搜索、语义检索、拼写纠正、相关度或排序。[前端搜索实现](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/public/skills.html#L653-L690)

仓库还提供一个 Flask “API 服务器示例”，其搜索同样只是名称/描述的包含判断和分类精确匹配。[示例 API 搜索](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/api_server_example.py#L144-L165) 该 Flask 服务不是 Vercel 线上站点的一部分。

## 4. 外部数据接口判定

| 接口或来源 | 是否使用 | 实际用途 |
|---|---|---|
| skills.sh 官方 API | **否** | 仓库无 `skills.sh` 引用，无 Vercel OIDC 实现 |
| skills.sh 网页抓取 | **否** | 未请求 skills.sh HTML |
| SkillsMP API | **否** | 仓库无 SkillsMP endpoint 或 Key |
| GitHub Search / Code Search API | **否** | 没有搜索全 GitHub 的请求 |
| GitHub raw 内容 | **是** | 下载 OpenAI、VoltAgent、ClawHub README |
| GitHub Contents API | **少量使用** | 仅列出 `openclaw/clawhub` 源码仓库的 `packages/` |
| GitHub 仓库元数据 API | **否** | 不读取 Stars、forks、pushed_at、license、archived |
| 自建 Skill Store API | **示例/可选 sink** | 接收本地爬虫推送，不是外部数据 source |

`api_client.py` 使用普通 Bearer Key 把采集结果推到配置的自建 API；默认 URL 是 localhost，默认配置下直接跳过。[客户端鉴权与默认跳过逻辑](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/api_client.py#L13-L50)

## 5. 部署与鉴权

### 线上站点

`vercel.json` 指定 `outputDirectory: "public"`，无 build/install command；`.vercelignore` 排除了所有 Python 文件。因此部署产物是纯静态站点，不运行爬虫、Flask API或动态搜索服务。[`vercel.json`](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/vercel.json)、[`.vercelignore`](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/.vercelignore)

Vercel 侧没有 OIDC、环境变量或 API 鉴权代码。静态 JSON 是公开文件。

### 自动同步

GitHub Actions 需要仓库 `contents: write`，主同步 checkout 显式使用 GitHub 自动提供的 `secrets.GITHUB_TOKEN`，用于提交更新。[权限配置](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/.github/workflows/sync-skills.yml#L17-L27)

外部 raw README 请求不鉴权。ClawHub 的 GitHub Contents API 请求也没有 Authorization header，因此受 GitHub 未鉴权请求限制影响。

### 本地旧系统

旧爬虫把数据和日志路径硬编码为 `C:\D\StepFun\skill_store_updater\...`，不是可移植的默认配置。[硬编码路径](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/config.py#L13-L24)

Flask 示例把 API Key 硬编码为 `your_secret_api_key_here`，注释才建议生产环境改用环境变量；写操作用 Bearer Token，读列表和搜索公开。[示例 API 鉴权](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/api_server_example.py#L12-L25)

## 6. 主要局限与实现风险

### 6.1 “自动更新网站目录”的说法与代码不一致

每日主工作流只提交 `SKILL_SOURCES.json` 和 README，不更新：

- `data/skills.json`
- `public/data/skills.json`
- `public/skills.html`
- `public/local_skills.html`

所以每日任务更新的是 GitHub README 的仓库链接区块，而不是用户在网页中浏览的 182 条官方 Skill。

此外，`public/skills.html` 没有 `fetch()`，固定版本中只有 28 张 `.skill-card`，并未把 182 条 JSON 逐条展示；官方部分主要是来源团队摘要。

### 6.2 本地页面与 JSON schema 不兼容

`public/local-skills.html` 读取 `data.independent_skills` 和 `data.skill_collections`。[页面读取逻辑](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/public/local-skills.html#L85-L113)

实际 `public/data/local_skills.json` 顶层是 `metadata`、`categories`、`statistics`、`highlights`、`update_log`，没有上述两个数组。因此按源码推断，该页面加载后会在 `forEach` 处抛出运行时错误。

### 6.3 采集召回率和精度不可控

- 只扫描两个上游 README，不能支持“全 GitHub”或“全网”；
- URL 正则只判断链接外形，不验证仓库存在、是否含 `SKILL.md`、是否是 Skill；
- 会误收 GitHub 用户附件、产品页和普通仓库；
- README 改版就可能造成漏采或分类错位；
- 只保存仓库级 URL，无法展开 monorepo 中的多个 Skill；
- 没有 canonical URL、大小写归一、fork/镜像/重复内容检测；
- 没有失败队列、来源健康度和上一次有效快照保护。

### 6.4 TLS 校验被关闭

当前 `scripts/sync_skills.py` 的 SSL context 明确设置：

```python
context.check_hostname = False
context.verify_mode = ssl.CERT_NONE
```

随后所有上游 README 下载都使用该 context。[SSL 与下载实现](https://github.com/anbeime/skill/blob/f595e9637eb6ce160889a8434c1edf49b0b1fd0f/scripts/sync_skills.py#L29-L44)

这会失去服务器身份校验，不应复用到生产采集器。

### 6.5 缺少质量、安全与治理层

没有：

- `SKILL.md` frontmatter/schema 验证；
- 文件树或实际内容抓取；
- 内容 hash 和版本固定；
- 安全扫描、恶意指令或 secret 检查；
- license 采集；
- 仓库 archived/删除状态；
- 来源置信度和人工审核状态；
- 安装兼容性测试。

仓库 README 声称 MIT，但固定版本根目录未见独立 `LICENSE` 文件；若要复制代码或数据，应先向维护者核实许可文本和上游内容的各自许可证。

## 7. 对 Vault2077 的可复用设计

### 值得复用

1. **GitHub Actions 定时采集 + Git 快照。** 适合低成本、可审计的小规模来源清单。
2. **按源配置解析器。** `UPSTREAM_SOURCES` 和 source-specific parser 是合理起点，但应变成标准 adapter 接口。
3. **保留 `upstream_source` 与首次发现时间。** 有助于来源追踪。
4. **静态 JSON 交付。** 对公开目录、每日更新和高缓存命中场景很经济。
5. **Issue/PR 投稿入口。** 可作为自动发现以外的人工补充通道。

### 不应直接复用

1. 关闭 TLS 校验；
2. 仅靠 README 正则；
3. 把“仓库”当作“Skill”；
4. 硬编码五星和统计；
5. 让采集数据、站点数据和页面 HTML 分别维护；
6. 把本机绝对路径写入仓库配置；
7. 无验证地覆盖最后一份有效快照；
8. 把自建 push API 示例误当外部市场 API。

### 建议吸收后的 Vault2077 流程

```text
官方市场 API / GitHub Search / 精选源清单
                    ↓
           source adapters（各自限流）
                    ↓
       URL 规范化 + repo/path/ref canonical ID
                    ↓
   验证 SKILL.md + 仓库元数据 + license + security
                    ↓
     raw snapshot → normalized skill records
                    ↓
 skills.sh 安装热度 + GitHub 质量信号 + 编辑精选
                    ↓
        搜索索引 / 排行榜快照 / 静态缓存
```

其中：

- skills.sh 官方 API 继续承担 All-time、Trending、Hot 安装榜；
- GitHub Search/GraphQL 补漏并提供 Stars、活跃度、license、archived 等信号；
- `anbeime/skill` 的 155 个 URL 只能作为 seed list，进入验证队列，不能直接进入生产目录；
- 推荐分数必须记录公式、原始信号和计算时间，人工精选则明确标注 editorial，不伪装成算法榜单。

## 8. 替代价值判断

| Vault2077 需求 | `anbeime/skill` 能否替代现有方案 |
|---|---|
| 跨 Code Agent 全局安装榜 | 不能 |
| All-time / Trending / Hot | 不能 |
| 大规模 Skill 搜索 | 不能 |
| GitHub 全网发现 | 不能 |
| 精选仓库种子 | 部分可以，需重新验证 |
| 中文垂直 Skill 灵感 | 可以作为人工研究线索 |
| 低成本静态目录架构 | 可以借鉴 |
| skills.sh API 的无 Vercel替代品 | 不能 |

最终判断：**它不是 skills.sh、SkillsMP 或 GitHub Skill Search 的更好替代，而是一个范围有限、数据层与展示层尚未打通的静态聚合样例。** 对 Vault2077 最有价值的不是数据覆盖或算法，而是“定时任务生成可审计静态快照”的轻量部署方式；其实际源清单只能作为补充候选集。

