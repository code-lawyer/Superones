---
type: research
status: active
updated: 2026-07-30
---

# Vault2077 SiC Skill 精选集：首批来源与候选证据

> 核验时间：2026-07-30
> 证据范围：官方 GitHub 仓库、仓库内 README / LICENSE / SECURITY / Release、官方 manifest、GitHub 官方 API 文档、Agent Skills 官方规范。
> 不作为准入证据：第三方榜单文章、未经披露算法的“综合分”、作者自述以外的二手转述。

## 结论先行

首批不应由单一市场全量导入，而应由两类互补来源构成：

1. **机构原生候选层**：约 48–52 个，由 OpenAI 当前 Plugins、Anthropic、NVIDIA、Hugging Face、Cloudflare、Trail of Bits、Vercel 等原始仓库提供。
2. **社区方法候选层**：约 36–42 个，由 obra/superpowers、addyosmani/agent-skills、planning-with-files、K-Dense、mattpocock/skills 提供。
3. **社区观察层**：GitHub Awesome Copilot 先进入候选队列，不因位于 GitHub 官方组织就自动获得“官方 Skill”身份。

来源核验可先形成 **84–94 个去重后的候选长名单**，但不应全部公开为首发精选。主策划案进一步按来源平衡、任务覆盖、去重和维护成本收敛为 48 个首发准入候选。长名单数量是研究配额而非产品硬指标：同一内容被多个仓库分发时按 `source repo + path + commit SHA + content hash` 去重，同类工作流只保留一个主推荐，必要时再保留一个风格明显不同的备选。

最重要的来源修正是：[openai/skills](https://github.com/openai/skills) 已被 OpenAI 明确标记为 deprecated，并指向当前的 [openai/plugins](https://github.com/openai/plugins)。因此 `.curated` 只能作为历史兼容源，不能再作为 SiC 的持续更新主源。

## 证据标准

### 格式底线

[Agent Skills 官方规范](https://agentskills.io/specification)要求每个 Skill 至少包含 `SKILL.md`，且 YAML frontmatter 必须有 `name` 和 `description`；`license`、`compatibility`、`metadata`、`allowed-tools` 为可选字段。规范同时指出：

- `scripts/` 可以包含可执行代码；
- `references/` 和 `assets/` 按需加载；
- 主 `SKILL.md` 建议低于 500 行；
- 可以用官方 `skills-ref validate` 做结构校验；
- `allowed-tools` 仍是实验字段，各 Agent 支持度可能不同。

因此，“符合 Agent Skills 格式”只证明可解析，不等于安全、有效、授权清晰或跨 Agent 可运行。

### 来源分级

| 等级 | 含义 | 页面徽章 |
|---|---|---|
| A | 产品或工具的官方组织直接维护 | 官方来源 |
| B | 专业团队或长期维护者发布，内容含社区贡献 | 社区验证 |
| C | 官方组织托管的社区投稿集合，逐项质量不一 | 社区观察 |
| H | 已废弃但仍有历史兼容价值 | 历史来源 |

### 机器采集基线

所有 GitHub 来源都可以使用官方 [Repository Contents API](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#get-repository-content)读取单个文件或目录；需要递归枚举时使用 [Git Trees API](https://docs.github.com/en/rest/git/trees?apiVersion=2022-11-28#get-a-tree)。生产采集必须：

1. 先解析仓库 manifest；manifest 不完整时递归枚举 `SKILL.md`。
2. 获取默认分支当前 commit，随后所有内容读取固定到该 SHA。
3. 同步 `SKILL.md`、同目录许可证、`scripts/`、`references/`、`assets/` 与仓库 manifest。
4. 记录 `repo`、`path`、`commit_sha`、文件树 hash、许可证、采集时间和最后人工复核时间。
5. 不直接执行采集到的脚本。

## 来源总表

| 来源 | 性质 | 维护状态快照 | 建议首批数 | 机器入口 | 许可重点 | 初步判断 |
|---|---|---|---:|---|---|---|
| [openai/skills](https://github.com/openai/skills) | H：OpenAI 旧目录 | README 明确标记 deprecated | 0 个新增；仅历史映射 | `skills/.curated/*/SKILL.md` | 每项独立 `LICENSE.txt` | 已废弃，不能做持续源 |
| [openai/plugins](https://github.com/openai/plugins) | A：OpenAI 当前插件目录 | 当前活跃目录，约 299 次提交 | 6 | `.agents/plugins/marketplace.json` + 每插件 manifest | 无法假定统一许可证，逐插件核验 | 当前 OpenAI 主源 |
| [anthropics/skills](https://github.com/anthropics/skills) | A：Anthropic 示例与生产参考 | 当前公开目录，约 46 次提交 | 6 | `.claude-plugin/marketplace.json` + `skills/*` | 混合授权；文档四件套仅 source-available | 精选接入，禁止整库镜像 |
| [NVIDIA/skills](https://github.com/NVIDIA/skills) | A：NVIDIA 验证目录 | 产品源每日自动同步，约 471 次提交 | 8 | `skills.sh.json` + `skills/*` | Skill/文档 CC BY 4.0；代码 Apache-2.0 | 治理最完整的官方源 |
| [huggingface/skills](https://github.com/huggingface/skills) | A：Hugging Face 官方 | 活跃，约 328 次提交 | 10 | `skills/*` + 内部 marketplace manifest | Apache-2.0 | AI/模型/数据核心源 |
| [cloudflare/skills](https://github.com/cloudflare/skills) | A：Cloudflare 官方 | 活跃，约 69 次提交 | 7 | `.claude-plugin/marketplace.json` + `skills/*` | Apache-2.0 | 小而完整，可接近全收 |
| [trailofbits/skills](https://github.com/trailofbits/skills) | A：安全公司官方 | 活跃，约 133 次提交 | 6 | `.claude-plugin/marketplace.json` + `plugins/*` | CC BY-SA 4.0 | 安全板块主源，注意同许可再分发 |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | A：Vercel 官方 | 活跃，约 257 次提交 | 7 | `skills.sh.json` + `skills/*` | MIT | 前端、设计、性能核心源 |
| [obra/superpowers](https://github.com/obra/superpowers) | B：社区方法论框架 | 持续发布；核验时最新 Release 为 2026-07 | 8 | `skills/*` | MIT | 工程纪律核心源 |
| [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) | B：社区工程工作流 | 持续发布；核验时最新 Release 为 2026-06 | 8 | `skills/*` | MIT | 生命周期覆盖强，需与 Superpowers 去重 |
| [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files) | B：单项社区项目 | 活跃，约 327 次提交，带 Changelog 和测试 | 1 | `.agents/skills/planning-with-files` 或 `skills/*`；另有 `llms.txt` | MIT | 证据透明，适合直接准入 |
| [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills) | B：公司维护、社区贡献 | 活跃，约 659 次提交，带逐 Skill 测试要求 | 8 | `skills/*` | 根仓 MIT，但逐 Skill 许可证可不同 | 科研主源，必须逐项审查 |
| [mattpocock/skills](https://github.com/mattpocock/skills) | B：社区维护者工作流 | 活跃，约 316 次提交，维护 Changelog | 5 | `skills/*` | MIT | 需求澄清与代码设计有独特价值 |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | C：GitHub 托管的社区合集 | 高频社区维护，约 2,132 次提交 | 0 个直接准入；5 个观察候选 | `skills/*` + 官方 `llms.txt` | 根仓 MIT；仍需检查逐项附带文件 | 发现源，不是质量担保 |

## 官方来源逐项核验

### 1. OpenAI：旧 Skills 降级，当前源迁到 Plugins

#### 来源性质与维护状态

[openai/skills README](https://github.com/openai/skills#readme)明确写明该仓库已经 deprecated，并要求当前 Codex Skill 与 Plugin 示例改用 [openai/plugins](https://github.com/openai/plugins)。旧仓库仍保留 `.system`、`.curated` 和 `.experimental`，但这只是历史兼容资产。

当前仓库 [openai/plugins README](https://github.com/openai/plugins#readme)说明：

- 每个插件位于 `plugins/<name>/`；
- 必须含 `.codex-plugin/plugin.json`；
- 可以附带 `skills/`、MCP、agents、commands、hooks 与 assets；
- 默认市场清单位于 [`.agents/plugins/marketplace.json`](https://github.com/openai/plugins/blob/main/.agents/plugins/marketplace.json)。

#### 首批建议

从当前 Plugins 选 6 个实际 Skill，而不是继续依赖旧 `.curated`：

- [github](https://github.com/openai/plugins/tree/main/plugins/github/skills/github)：GitHub 仓库、Issue 与 PR 工作入口。
- [gh-fix-ci](https://github.com/openai/plugins/tree/main/plugins/github/skills/gh-fix-ci)：定位并修复 GitHub Actions 失败。
- [frontend-app-builder](https://github.com/openai/plugins/tree/main/plugins/build-web-apps/skills/frontend-app-builder)：前端应用构建工作流。
- [frontend-testing-debugging](https://github.com/openai/plugins/tree/main/plugins/build-web-apps/skills/frontend-testing-debugging)：前端验证与调试。
- [security-scan](https://github.com/openai/plugins/tree/main/plugins/codex-security/skills/security-scan)：代码安全扫描入口。
- [threat-model](https://github.com/openai/plugins/tree/main/plugins/codex-security/skills/threat-model)：威胁建模。

旧库中的 `gh-fix-ci`、`gh-address-comments`、`playwright`、`openai-docs`、`security-best-practices`、`security-threat-model` 只保留迁移映射，不形成第二份展示条目。

#### 许可证与风险

[旧库 README](https://github.com/openai/skills#license)明确要求读取每个 Skill 目录内的 `LICENSE.txt`。当前 Plugins 根目录没有可据以推断全部插件授权的统一许可证，因此每个插件和 Skill 必须单独核验；没有明确再分发授权时，SiC 只保存元数据、摘要和上游安装链接，不镜像正文。

风险还包括插件可能同时带 MCP、hooks 或外部连接。页面应把“Skill 内容”和“完整插件能力”分开显示，不能因为用户只点击一个 Skill 就静默安装整个有额外权限的插件。

### 2. Anthropic Skills

#### 来源性质与维护状态

[Anthropic 仓库 README](https://github.com/anthropics/skills#readme)将其定位为 Claude Skills 的公开实现与示例，包含创意、技术、企业工作流以及生产环境中使用的文档能力。它同时明确提醒这些内容主要用于演示和教育，关键任务必须在目标环境测试。

#### 首批建议

- [mcp-builder](https://github.com/anthropics/skills/tree/main/skills/mcp-builder)：MCP Server 设计与实现。
- [webapp-testing](https://github.com/anthropics/skills/tree/main/skills/webapp-testing)：Web 应用验证。
- [frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)：前端视觉与界面实现。
- [skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator)：创建与改进 Skill。
- [doc-coauthoring](https://github.com/anthropics/skills/tree/main/skills/doc-coauthoring)：协作文档工作流。
- [internal-comms](https://github.com/anthropics/skills/tree/main/skills/internal-comms)：企业内部沟通。

#### 许可证与风险

[Anthropic README 的授权说明](https://github.com/anthropics/skills#about-this-repository)明确区分：

- 许多示例 Skill 是 Apache 2.0；
- `docx`、`pdf`、`pptx`、`xlsx` 是 source-available，而非开源。

所以不能给整个仓库统一贴“Apache-2.0”。首批不镜像文档四件套；如需展示，只做上游链接和许可提示。另一个风险是部分工作流以 Claude 工具语义写成，SiC 需要在 Codex、Cursor 等目标 Agent 做兼容测试。

### 3. NVIDIA Skills

#### 来源性质与维护状态

[NVIDIA Skills README](https://github.com/NVIDIA/skills#readme)将该目录定义为 NVIDIA 验证的官方 Skill。内容由各产品仓库维护，并由自动管线每日同步。

其治理证据目前是所有候选中最完整的：

- 每项带 `skill.oms.sig`，可用仓库中的 `nv-agent-root-cert.pem` 验证内容未被修改；
- 每项带 `skill-card.md`；
- 发布门槛要求 Tier-3 评测数据；
- 有评测结果时同时附带 `BENCHMARK.md`；
- 同步管线包含安全扫描、签名漂移和缺失产物门禁。

以上要求均在 [验证与仓库结构说明](https://github.com/NVIDIA/skills#verifying-skills)中公开。

#### 首批建议

- [aiq-research](https://github.com/NVIDIA/skills/tree/main/skills/aiq-research)：AI-Q / Agent 场景研究。
- [accelerated-computing-cudf](https://github.com/NVIDIA/skills/tree/main/skills/accelerated-computing-cudf)：GPU 数据处理。
- [nemo-data-designer-plugin](https://github.com/NVIDIA/skills/tree/main/skills/nemo-data-designer-plugin)：合成数据与数据设计。
- [cupynumeric-migration-readiness](https://github.com/NVIDIA/skills/tree/main/skills/cupynumeric-migration-readiness)：NumPy 工作负载迁移评估。
- [nemo-retriever](https://github.com/NVIDIA/skills/tree/main/skills/nemo-retriever)：检索工作流。
- [rag-blueprint](https://github.com/NVIDIA/skills/tree/main/skills/rag-blueprint)：RAG 部署与排障。
- [rag-eval](https://github.com/NVIDIA/skills/tree/main/skills/rag-eval)：RAG 评测。
- [skill-card-generator](https://github.com/NVIDIA/skills/tree/main/skills/skill-card-generator)：Skill 治理卡生成。

#### 许可证与风险

[NVIDIA 许可说明](https://github.com/NVIDIA/skills#license)是双重许可：源代码 Apache-2.0，文档与 Skill 内容 CC BY 4.0。因此 SiC 镜像或改写 Skill 内容时必须保留署名；不要误标为“整个仓库 Apache-2.0”。

风险主要是 CUDA、NVIDIA 服务、容器、GPU 或网络依赖。页面需显示运行前置条件，不能把“已验证来源”解释成“任何设备都能直接运行”。

### 4. Hugging Face Skills

#### 来源性质与维护状态

[Hugging Face Skills README](https://github.com/huggingface/skills#readme)说明该仓库遵循 Agent Skills 标准，兼容 Claude Code、Codex、Gemini CLI 和 Cursor；`hf-cli` 是推荐的第一个入口，且可由本地 CLI 生成以保持命令知识新鲜。

#### 首批建议

- [hf-cli](https://github.com/huggingface/skills/tree/main/skills/hf-cli)：Hub 搜索、模型、数据集、Spaces 与 Jobs 基础入口。
- [huggingface-best](https://github.com/huggingface/skills/tree/main/skills/huggingface-best)：Hugging Face 任务路由。
- [huggingface-datasets](https://github.com/huggingface/skills/tree/main/skills/huggingface-datasets)：数据集创建与处理。
- [huggingface-local-models](https://github.com/huggingface/skills/tree/main/skills/huggingface-local-models)：本地模型运行。
- [huggingface-community-evals](https://github.com/huggingface/skills/tree/main/skills/huggingface-community-evals)：模型评测。
- [huggingface-papers](https://github.com/huggingface/skills/tree/main/skills/huggingface-papers)：论文发现与阅读。
- [huggingface-spaces](https://github.com/huggingface/skills/tree/main/skills/huggingface-spaces)：Spaces 应用。
- [huggingface-gradio](https://github.com/huggingface/skills/tree/main/skills/huggingface-gradio)：Gradio 界面。
- [huggingface-llm-trainer](https://github.com/huggingface/skills/tree/main/skills/huggingface-llm-trainer)：LLM 训练流程。
- [train-sentence-transformers](https://github.com/huggingface/skills/tree/main/skills/train-sentence-transformers)：嵌入模型训练。

#### 许可证与风险

仓库根许可证为 [Apache-2.0](https://github.com/huggingface/skills/blob/main/LICENSE)。涉及模型、数据集和第三方服务时，还必须分别遵守上游模型/数据许可证，仓库许可证不能替代这些授权。

训练、推理、发布和远程 Jobs 可能产生算力费用或公开资产；首版可以展示安装，但执行前必须由 Agent 自己走权限与副作用确认。

### 5. Cloudflare Skills

#### 来源性质与维护状态

[Cloudflare README](https://github.com/cloudflare/skills#readme)明确说明该目录面向 Cloudflare、Workers、Agents SDK 与开发者平台，并支持 Claude Code、OpenCode、Codex 和 Pi 等兼容 Agent Skills 的客户端。

#### 首批建议

- `cloudflare`：平台全景与能力路由。
- `agents-sdk`：有状态 Agent、RPC、MCP、调度与流式聊天。
- `durable-objects`：状态协调、SQLite、Alarms 与 WebSocket。
- `sandbox-sdk`：受控代码执行环境。
- `wrangler`：Workers 及相关资源部署管理。
- `web-perf`：Core Web Vitals 和加载链路审计。
- `building-mcp-server-on-cloudflare`：远程 MCP Server。

上述名称与用途均可在官方 [Skills 清单](https://github.com/cloudflare/skills#skills)中直接核验。

#### 许可证与风险

仓库为 [Apache-2.0](https://github.com/cloudflare/skills/blob/main/LICENSE)。`sandbox-sdk` 涉及代码执行，`wrangler` 和 MCP Server 工作流涉及远程资源与部署；应显示“高权限”或“有外部副作用”标签。

### 6. Trail of Bits Skills

#### 来源性质与维护状态

[Trail of Bits Skills](https://github.com/trailofbits/skills#readme)是该安全公司的 Claude Code / Codex 插件市场，覆盖代码审计、验证、逆向、移动安全、开发与基础设施工作流。官方 README 明确写明 Codex 可以直接读取其 Claude marketplace。

#### 首批建议

- [differential-review](https://github.com/trailofbits/skills/tree/main/plugins/differential-review)：基于 diff 与 Git 历史的安全审查。
- [insecure-defaults](https://github.com/trailofbits/skills/tree/main/plugins/insecure-defaults)：不安全默认值与 fail-open 模式。
- [static-analysis](https://github.com/trailofbits/skills/tree/main/plugins/static-analysis)：CodeQL、Semgrep 与 SARIF。
- [supply-chain-risk-auditor](https://github.com/trailofbits/skills/tree/main/plugins/supply-chain-risk-auditor)：依赖供应链风险。
- [property-based-testing](https://github.com/trailofbits/skills/tree/main/plugins/property-based-testing)：多语言属性测试。
- [semgrep-rule-creator](https://github.com/trailofbits/skills/tree/main/plugins/semgrep-rule-creator)：自定义 Semgrep 规则。

`c-review`、`rust-review`、`constant-time-analysis` 等专家项可进入第二批。

#### 许可证与风险

仓库使用 [CC BY-SA 4.0](https://github.com/trailofbits/skills/blob/main/LICENSE)。镜像或修改时需要署名、标明变更并以相同许可证分享；最简单的首版方案是保留上游安装链接，不在 Vault 内改写分发。

这些 Skill 会调用静态分析器、编译器、Git 历史或外部 CLI，安装前必须显示依赖。安全 Skill 也不能被展示成“扫描通过就保证安全”。

### 7. Vercel Agent Skills

#### 来源性质与维护状态

[Vercel 官方仓库](https://github.com/vercel-labs/agent-skills#readme)声明这些 Skill 遵循 Agent Skills 格式，并在 README 中公开用途和触发条件。目录带 `skills.sh.json`，可以先读 manifest，再固定 commit 抓取文件。

#### 首批建议

- `react-best-practices`：React / Next.js 性能规则。
- `web-design-guidelines`：可访问性、性能与 UX 审查。
- `composition-patterns`：可扩展的 React 组件组合。
- `vercel-optimize`：基于 Vercel 指标的成本、可靠性与性能审计。
- `writing-guidelines`：文档结构、语气与代码示例规范。
- `react-native-guidelines`：React Native / Expo 工程实践。
- `react-view-transitions`：React View Transition 与 Next.js 路由动画。

这些用途均可在官方 [Available Skills](https://github.com/vercel-labs/agent-skills#available-skills)中核验。

#### 许可证与风险

仓库 README 声明 [MIT](https://github.com/vercel-labs/agent-skills#license)。`vercel-optimize` 需要读取项目指标；涉及账户和账单数据时必须采用最小权限。部署类 Skill 具有真实外部副作用，建议放第二批。

## 社区来源逐项核验

### 8. obra/superpowers

#### 来源性质与维护状态

[Superpowers README](https://github.com/obra/superpowers#readme)把项目定义为可组合的完整软件开发方法论，而不是产品 API 知识库。官方仓库要求 Skill 更新跨其支持的 coding agents 工作，并公开说明 Skill 行为测试使用独立 eval harness。仓库提供 [Release 页面](https://github.com/obra/superpowers/releases)和 [Release Notes](https://github.com/obra/superpowers/blob/main/RELEASE-NOTES.md)，截至核验日仍持续发布。

#### 首批建议

- [brainstorming](https://github.com/obra/superpowers/tree/main/skills/brainstorming)
- [writing-plans](https://github.com/obra/superpowers/tree/main/skills/writing-plans)
- [executing-plans](https://github.com/obra/superpowers/tree/main/skills/executing-plans)
- [systematic-debugging](https://github.com/obra/superpowers/tree/main/skills/systematic-debugging)
- [test-driven-development](https://github.com/obra/superpowers/tree/main/skills/test-driven-development)
- [verification-before-completion](https://github.com/obra/superpowers/tree/main/skills/verification-before-completion)
- [requesting-code-review](https://github.com/obra/superpowers/tree/main/skills/requesting-code-review)
- [receiving-code-review](https://github.com/obra/superpowers/tree/main/skills/receiving-code-review)

`using-git-worktrees` 和 `subagent-driven-development` 放第二批，因为它们更依赖具体 Agent 的工具能力和仓库策略。

#### 许可证与风险

仓库是 [MIT](https://github.com/obra/superpowers/blob/main/LICENSE)。主要风险不是恶意代码，而是“框架级 Skill”可能改变整个开发流程；单独抽取某个 Skill 时要检查它是否引用其他 Superpowers Skill 或启动规则，避免产生残缺体验。

### 9. addyosmani/agent-skills

#### 来源性质与维护状态

[项目 README](https://github.com/addyosmani/agent-skills#readme)公开列出 24 个工程 Skill，覆盖 DEFINE → PLAN → BUILD → VERIFY → REVIEW → SHIP。其设计强调流程、验证门禁、反合理化和渐进披露；仓库有 [Releases](https://github.com/addyosmani/agent-skills/releases)，截至核验日持续发布。

#### 首批建议

为避免与 Superpowers 重复，优先收录它更有差异化的 8 个：

- [api-and-interface-design](https://github.com/addyosmani/agent-skills/tree/main/skills/api-and-interface-design)
- [browser-testing-with-devtools](https://github.com/addyosmani/agent-skills/tree/main/skills/browser-testing-with-devtools)
- [deprecation-and-migration](https://github.com/addyosmani/agent-skills/tree/main/skills/deprecation-and-migration)
- [observability-and-instrumentation](https://github.com/addyosmani/agent-skills/tree/main/skills/observability-and-instrumentation)
- [performance-optimization](https://github.com/addyosmani/agent-skills/tree/main/skills/performance-optimization)
- [security-and-hardening](https://github.com/addyosmani/agent-skills/tree/main/skills/security-and-hardening)
- [shipping-and-launch](https://github.com/addyosmani/agent-skills/tree/main/skills/shipping-and-launch)
- [context-engineering](https://github.com/addyosmani/agent-skills/tree/main/skills/context-engineering)

其余 planning、debugging、TDD、review Skill 进入 A/B 评测队列，与 Superpowers 同类项择优。

#### 许可证与风险

仓库为 [MIT](https://github.com/addyosmani/agent-skills/blob/main/LICENSE)。风险是生命周期 Skill 之间交叉引用较多，抽取时要核验依赖；同时部分集成以 Claude Plugin 为首选路径，跨 Agent 兼容声明仍需实际验证。

### 10. OthmanAdi/planning-with-files

#### 来源性质与维护状态

[planning-with-files README](https://github.com/OthmanAdi/planning-with-files#readme)公开了规范路径、多个 Agent 适配、测试目录、变更日志和安全政策。它将 `task_plan.md`、`findings.md`、`progress.md` 作为持久工作记忆。

项目公开了作者自测的 [评测方法与结果](https://github.com/OthmanAdi/planning-with-files/blob/master/docs/evals.md)：README 明确披露 96.7% 指标测的是三文件模式遵循度，不代表长程目标漂移；恢复评测也是作者运行的内部 benchmark，而非独立第三方评测。这种边界披露本身是正面治理信号。

#### 首批建议

- [planning-with-files](https://github.com/OthmanAdi/planning-with-files/tree/master/.agents/skills/planning-with-files)：首批直接准入 1 个。

#### 许可证与风险

仓库为 [MIT](https://github.com/OthmanAdi/planning-with-files/blob/master/LICENSE)，并有 [SECURITY.md](https://github.com/OthmanAdi/planning-with-files/blob/master/SECURITY.md)。该 Skill 带 hooks 和脚本，历史上曾主动缩减不必要的 Web 权限；这不等于可以跳过 SiC 自己的脚本审查。应分别展示“标准 Skill 模式”和“增强 hooks 模式”的权限差异。

### 11. K-Dense Scientific Agent Skills

#### 来源性质与维护状态

[K-Dense README](https://github.com/K-Dense-AI/scientific-agent-skills#readme)当前列出 158 个科研与研究 Skill，兼容开放 Agent Skills 标准。仓库接受社区贡献，但要求有效 frontmatter、版本、测试，并对所有 Skill 使用 Cisco AI Defense Skill Scanner；带 `scripts/` 的新增 Skill 要提供测试。

#### 首批建议

只选通用研究能力，不在首批引入诊断、治疗、真实实验设备控制或高成本计算：

- [paper-lookup](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/paper-lookup)：多学术来源检索。
- [literature-review](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/literature-review)：文献综述。
- [scientific-writing](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/scientific-writing)：可追溯科学写作。
- [peer-review](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/peer-review)：本地、保密、授权范围内的同行评审。
- [citation-management](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/citation-management)：引文管理。
- [statistical-analysis](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/statistical-analysis)：统计分析流程。
- [experimental-design](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/experimental-design)：实验设计。
- [scientific-visualization](https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills/scientific-visualization)：出版级可视化。

#### 许可证与风险

根仓库为 [MIT](https://github.com/K-Dense-AI/scientific-agent-skills/blob/main/LICENSE.md)，但官方 README 明确说明**每个 Skill 可以有不同许可证**，必须读取各自 `SKILL.md` 的 `license` 字段。

官方 [Security Disclaimer](https://github.com/K-Dense-AI/scientific-agent-skills#%EF%B8%8F-security-disclaimer)也明确承认 Skill 可能运行任意代码、安装包、访问网络和修改文件；仓库扫描不等于穷尽审查。首批应排除：

- 临床诊断、治疗推荐、个体风险判定；
- 实验室设备真实执行；
- 缺少清晰许可证；
- 需要未披露 API Key、收费服务或敏感数据上传；
- 高危扫描问题未关闭的条目。

### 12. mattpocock/skills

#### 来源性质与维护状态

[仓库 README](https://github.com/mattpocock/skills#readme)说明这些是作者日常使用的工程 Skill，强调小、可组合、模型无关；支持通过 `npx skills` 安装和更新，也提供 Claude 官方 marketplace 路径。仓库公开维护 `CHANGELOG.md`。

#### 首批建议

选择与前述工程流程差异最大的 5 个：

- [grilling](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling)：对计划、决策或想法做穷举式追问。
- [domain-modeling](https://github.com/mattpocock/skills/tree/main/skills/engineering/domain-modeling)：建立项目通用语言与领域模型。
- [codebase-design](https://github.com/mattpocock/skills/tree/main/skills/engineering/codebase-design)：深模块与清晰接口设计。
- [prototype](https://github.com/mattpocock/skills/tree/main/skills/engineering/prototype)：用一次性原型回答设计问题。
- [research](https://github.com/mattpocock/skills/tree/main/skills/engineering/research)：基于一手来源产出可追溯研究稿。

`tdd`、`diagnosing-bugs`、`code-review` 暂不首批重复收录，先与 Superpowers / Addy 同类项做效果对比。

#### 许可证与风险

仓库为 [MIT](https://github.com/mattpocock/skills/blob/main/LICENSE)。部分用户触发型 Skill 会编排其他 Skill、Issue Tracker 或子 Agent，单项安装时要核验依赖；`grilling` 还应提供“何时不适用”提示，避免简单任务被过度盘问。

### 13. GitHub Awesome Copilot

#### 来源性质与维护状态

[GitHub Awesome Copilot README](https://github.com/github/awesome-copilot#readme)明确定义它是 community-created collection，包含 agents、instructions、skills、hooks、workflows 和 plugins。README 还明确提示这些定制内容来自第三方开发者，安装前应自行检查。

它提供机器可读的 [llms.txt](https://awesome-copilot.github.com/llms.txt)和公开 [skills 目录](https://github.com/github/awesome-copilot/tree/main/skills)，非常适合发现新候选；但“位于 github 组织”不能转译成“每项由 GitHub 官方背书”。

#### 首批观察候选

以下 5 个只进入人工审核与场景测试，不直接获得“社区验证”：

- [acquire-codebase-knowledge](https://github.com/github/awesome-copilot/tree/main/skills/acquire-codebase-knowledge)
- [agent-supply-chain](https://github.com/github/awesome-copilot/tree/main/skills/agent-supply-chain)
- [agentic-eval](https://github.com/github/awesome-copilot/tree/main/skills/agentic-eval)
- [anti-ui-slop](https://github.com/github/awesome-copilot/tree/main/skills/anti-ui-slop)
- [architecture-blueprint-generator](https://github.com/github/awesome-copilot/tree/main/skills/architecture-blueprint-generator)

#### 许可证与风险

根仓库为 [MIT](https://github.com/github/awesome-copilot/blob/main/LICENSE)，但 Skill 可能附带自己的 `LICENSE.txt`、脚本或外部依赖，仍须逐项解析。社区投稿数量大、主题跨度大，仓库收录是发现信号，不是有效性、安全性或维护承诺。

## 候选长名单推荐组合

### 推荐配额

| 板块 | 数量 | 主要来源 |
|---|---:|---|
| 需求澄清、计划与长期任务 | 10–12 | Superpowers、planning-with-files、mattpocock |
| 编码、调试、测试与交付 | 18–20 | Superpowers、Addy、OpenAI |
| 安全、供应链与审计 | 12–14 | Trail of Bits、OpenAI、NVIDIA |
| AI、模型、数据与 RAG | 16–18 | Hugging Face、NVIDIA |
| 前端、设计与性能 | 12–14 | Vercel、Anthropic、Cloudflare、OpenAI |
| 科研、文献、统计与写作 | 10–12 | K-Dense、Anthropic |
| 云平台、Agent 与 MCP | 8–10 | Cloudflare、Anthropic、OpenAI |

长名单总数在去重后保持 84–94，公开首发再收敛至主策划案定义的 48 项。`Skill Card Generator` 这类维护工具可放在“创建 Skill”分类，不与终端用户工作流混为一类。

### 去重优先级

同类 Skill 的默认主推荐顺序不是简单按“官方优先”，而按任务证据选择：

1. **产品知识型**：产品官方优先，例如 Hugging Face、Cloudflare、Vercel。
2. **通用方法型**：可复现实测与流程完整度优先，官方身份不加成。
3. **安全型**：专业安全团队、明确依赖和可审计输出优先。
4. **科研型**：来源可追溯、统计边界和高风险限制优先。

建议首批安排三组 A/B：

- Superpowers `test-driven-development` vs Addy `test-driven-development`；
- Superpowers `systematic-debugging` vs Addy `debugging-and-error-recovery` vs Matt `diagnosing-bugs`；
- Vercel `web-design-guidelines` vs Anthropic `frontend-design`：前者偏审查，后者偏创作，若任务边界清楚可以同时保留。

## 维护建议

### 自动更新

- 每日读取 manifest 与默认分支 commit。
- commit 未变化时不重复下载。
- commit 变化后生成文件树 diff、内容 hash 与风险 diff。
- 纯描述、链接和示例文字变化可在扫描通过后自动同步到“待发布快照”。
- 上游删除、归档或 404 时保留最后批准版本，标记为 stale，不立即物理删除。

### 必须人工复核的变化

- 新增或修改 `scripts/`、hooks、MCP、commands；
- `allowed-tools`、网络域名、外部 API、凭据要求变化；
- 新增写操作、部署、付费资源、系统包或设备控制；
- 许可证变化、许可证消失或来源仓库迁移；
- Skill 核心流程与输出承诺变化；
- 安全扫描出现 High / Critical；
- 同类 Skill 发生足以改变主推荐的重大更新。

### 源级策略

- `openai/skills`：停止新增同步，只维护到 `openai/plugins` 的迁移映射。
- NVIDIA：每日同步并验证签名；验签失败自动暂停。
- Anthropic、K-Dense：逐 Skill 许可证，禁止继承根仓许可。
- Trail of Bits：默认上游链接安装；若镜像，保留 CC BY-SA 署名和同许可。
- Awesome Copilot：只自动进入候选池，不自动公开为精选。
- 其他社区源：允许低风险更新自动进入待发布快照，但首次准入和重大变化必须人工确认。

## 需要在主策划案中明确的事实边界

- “官方来源”只说明发布者身份，不等于效果经过独立验证。
- GitHub Star 是仓库级信号，不是单个 Skill 使用量。
- 作者自测 benchmark 可以展示，但必须标注“作者运行”，不能写成独立验证。
- 安全扫描通过不等于无风险。
- 仓库根许可证不一定覆盖每个 Skill、第三方模型、数据或 API。
- 跨 Agent 兼容声明必须以 SiC 自己的安装与任务测试为最终准入证据。
- SiC 首版应提供上游安装入口，不应在未完成法律和安全审核时镜像全部内容。
