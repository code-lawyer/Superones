import type { EventRecord, FrontierEntry, Service, TrendProject } from "./types";

export const siteStatus = {
  updated: "2026.07.21 14:32 CST",
  sources: 128,
  season: "2026 夏季赛",
  seasonState: "开放报名",
  settlement: "2026.09.30",
};

export const events: EventRecord[] = [
  {
    slug: "open-agent-runtime-release",
    record: "VLT/EVT/2026/00731",
    category: "公司公告",
    title: "开放式 Agent 运行时发布长任务状态恢复能力",
    originalTitle: "Open agent runtime adds durable recovery for long-running tasks",
    summary: "新的状态恢复机制将执行记录、工具结果与人工确认点拆分保存，使长任务在中断后可以从最近的可信节点继续。",
    significance: "对一人公司而言，Agent 是否能恢复，比单次推理速度更接近真实生产力。它决定了自动化流程能否跨越数小时甚至数天稳定运行。",
    entities: ["Agent Runtime", "Long-running Tasks", "Workflow"],
    firstSeen: "2026.07.21 09:10",
    updated: "2026.07.21 13:42",
    sources: [
      { name: "项目官方博客", url: "https://example.com/source/runtime", publishedAt: "2026.07.21 09:00" },
      { name: "GitHub Release", url: "https://github.com/example/runtime", publishedAt: "2026.07.21 10:18" },
    ],
    timeline: [
      { time: "09:00", text: "官方博客发布架构说明。" },
      { time: "10:18", text: "GitHub 同步发布可测试版本。" },
      { time: "13:42", text: "维护者补充迁移和回滚说明。" },
    ],
  },
  {
    slug: "small-model-tool-use",
    record: "VLT/EVT/2026/00728",
    category: "研究文章",
    title: "小模型工具调用研究把重点从准确率转向恢复成本",
    originalTitle: "Tool-use evaluation shifts toward recovery cost for smaller models",
    summary: "研究提出用失败后的恢复步数和额外调用成本衡量工具使用，而不是只看任务是否最终完成。",
    significance: "这更符合超级个体对成本、延迟和可维护性的真实约束，也为模型路由提供了更实用的评价维度。",
    entities: ["Small Models", "Tool Use", "Evaluation"],
    firstSeen: "2026.07.20 18:20",
    updated: "2026.07.21 08:14",
    sources: [
      { name: "研究预印本", url: "https://example.com/source/paper", publishedAt: "2026.07.20 18:00" },
    ],
    timeline: [
      { time: "07.20 18:00", text: "论文与评测代码同步公开。" },
      { time: "07.21 08:14", text: "作者补充不同工具数量下的消融结果。" },
    ],
  },
  {
    slug: "founder-context-interview",
    record: "VLT/EVT/2026/00724",
    category: "人物观点",
    title: "一人公司真正稀缺的不是工具，而是连续上下文",
    originalTitle: "The scarce resource in a one-person company is continuous context",
    summary: "一位产品创始人认为，工具数量继续增加并不会自动提高产出；能否让决策、客户与代码保持连续上下文才是核心。",
    significance: "这解释了为什么大量自动化最终仍退化为人工复制粘贴，也指向 Vault2077 应关注的基础设施方向。",
    entities: ["Solo Founder", "Context", "Operations"],
    firstSeen: "2026.07.20 12:30",
    updated: "2026.07.20 12:30",
    sources: [
      { name: "公开访谈", url: "https://example.com/source/interview", publishedAt: "2026.07.20 12:00" },
    ],
    timeline: [{ time: "12:00", text: "访谈节目发布。" }],
  },
  {
    slug: "agent-memory-podcast",
    record: "VLT/EVT/2026/00719",
    category: "播客",
    title: "当 Agent 拥有长期记忆，产品边界会发生什么变化",
    originalTitle: "What changes when agents retain long-term memory?",
    summary: "节目从隐私、错误累积和个性化三个角度讨论长期记忆，并提出用户必须能够查看、修订和删除记忆。",
    significance: "长期记忆不是简单的向量库功能，而是权限、可解释性与产品责任的组合问题。",
    entities: ["Agent Memory", "Privacy", "Product Design"],
    firstSeen: "2026.07.19 21:00",
    updated: "2026.07.20 09:05",
    sources: [
      { name: "播客节目页", url: "https://example.com/source/podcast", publishedAt: "2026.07.19 21:00" },
      { name: "节目文字稿", url: "https://example.com/source/transcript", publishedAt: "2026.07.20 09:05" },
    ],
    timeline: [
      { time: "07.19 21:00", text: "节目上线。" },
      { time: "07.20 09:05", text: "完整文字稿发布。" },
    ],
  },
  {
    slug: "inference-price-update",
    record: "VLT/EVT/2026/00715",
    category: "公司公告",
    title: "推理服务调整批处理价格与缓存计费规则",
    originalTitle: "Inference platform updates batch and cache pricing",
    summary: "新规则降低批处理输入成本，同时把长缓存保留改为分段计费，对高频工作流和夜间批任务影响不同。",
    significance: "一人公司常把多个自动化任务集中到少数模型供应商，计费细节变化可能直接改变产品毛利。",
    entities: ["Inference", "Pricing", "Caching"],
    firstSeen: "2026.07.19 15:10",
    updated: "2026.07.19 18:22",
    sources: [
      { name: "官方定价页", url: "https://example.com/source/pricing", publishedAt: "2026.07.19 15:00" },
    ],
    timeline: [
      { time: "15:00", text: "新定价规则生效。" },
      { time: "18:22", text: "官方补充缓存计费示例。" },
    ],
  },
  {
    slug: "mcp-audit-patterns",
    record: "VLT/EVT/2026/00708",
    category: "研究文章",
    title: "MCP 服务审计开始形成可复用的最小检查框架",
    originalTitle: "A minimal audit framework emerges for MCP servers",
    summary: "社区把权限声明、输入边界、外部请求和密钥处理整理为一套可自动检查的基础框架。",
    significance: "当工具连接成为 Agent 基础能力，安装前审计会像依赖漏洞扫描一样成为默认环节。",
    entities: ["MCP", "Security", "Audit"],
    firstSeen: "2026.07.18 16:40",
    updated: "2026.07.19 11:12",
    sources: [
      { name: "维护者文章", url: "https://example.com/source/audit", publishedAt: "2026.07.18 16:40" },
      { name: "规范仓库", url: "https://github.com/example/audit", publishedAt: "2026.07.19 11:12" },
    ],
    timeline: [
      { time: "07.18 16:40", text: "检查框架首次公开。" },
      { time: "07.19 11:12", text: "规则文件和示例仓库开放。" },
    ],
  },
  {
    slug: "open-voice-stack",
    record: "VLT/EVT/2026/00702",
    category: "公司公告",
    title: "开源语音栈新增端侧流式合成与中断恢复",
    originalTitle: "Open voice stack adds on-device streaming and interruption recovery",
    summary: "新版本降低首帧等待，并允许对话被打断后从语义边界恢复，面向本地助手和实时客服场景。",
    significance: "端侧语音能力正在从演示走向可组合模块，为小团队减少实时交互基础设施成本。",
    entities: ["Voice", "On-device", "Streaming"],
    firstSeen: "2026.07.18 10:00",
    updated: "2026.07.18 14:25",
    sources: [
      { name: "项目公告", url: "https://example.com/source/voice", publishedAt: "2026.07.18 10:00" },
    ],
    timeline: [
      { time: "10:00", text: "版本与性能报告发布。" },
      { time: "14:25", text: "维护者更新兼容设备列表。" },
    ],
  },
  {
    slug: "solo-company-ops-stack",
    record: "VLT/EVT/2026/00698",
    category: "人物观点",
    title: "超级个体的中后台应先标准化，再谈全面自动化",
    originalTitle: "Standardize solo-company operations before automating everything",
    summary: "观点认为，合同、财税、客户交付与内容发布需要先形成稳定清单，否则 Agent 只会更快地放大混乱。",
    significance: "这与 OPC 服务台的产品方法一致：先把专业经验封装成边界明确的服务，再逐步增加自动化。",
    entities: ["OPC", "Operations", "Automation"],
    firstSeen: "2026.07.17 19:20",
    updated: "2026.07.17 19:20",
    sources: [
      { name: "创始人公开文章", url: "https://example.com/source/ops", publishedAt: "2026.07.17 19:20" },
    ],
    timeline: [{ time: "19:20", text: "文章发布。" }],
  },
];

export const services: Service[] = [
  { slug: "contract-review", code: "OPC/LEGAL/001", category: "法务", name: "单份标准商业合同审阅", price: "¥699", period: "3 个工作日", audience: "需要签署常见采购、服务或合作合同的一人公司。", includes: ["审阅一份不超过 20 页的中文合同", "标注主要风险与修改建议", "一次 30 分钟交付说明"], excludes: ["合同起草", "跨境交易", "诉讼或争议处理"], materials: ["可编辑合同文件", "交易背景说明", "期望达成的核心目标"], deliverables: ["修订标注版合同", "风险摘要"], revision: "REV.01" },
  { slug: "website-legal-pack", code: "OPC/LEGAL/002", category: "法务", name: "网站用户协议与隐私政策基础包", price: "¥1,999", period: "7 个工作日", audience: "面向中国大陆用户提供基础网络服务的早期产品。", includes: ["用户协议基础版本", "隐私政策基础版本", "一次业务信息访谈"], excludes: ["医疗、金融等强监管业务", "跨境数据专项评估", "定制交易条款"], materials: ["产品功能说明", "数据收集清单", "经营主体信息"], deliverables: ["用户协议", "隐私政策", "上线检查清单"], revision: "REV.01" },
  { slug: "tax-health-check", code: "OPC/TAX/001", category: "税务与财务", name: "经营主体税务健康检查", price: "¥899", period: "5 个工作日", audience: "已经开始经营，希望检查基础申报与票据风险的个体或公司。", includes: ["基础申报记录检查", "票据与收入匹配检查", "风险清单说明"], excludes: ["税务稽查代理", "历史账务重建", "专项税收筹划"], materials: ["主体基础信息", "近期申报表", "收入与票据汇总"], deliverables: ["税务健康检查报告", "整改事项清单"], revision: "REV.01" },
  { slug: "finance-consult", code: "OPC/TAX/002", category: "税务与财务", name: "一人公司基础财税咨询", price: "¥599", period: "60 分钟", audience: "正在选择经营主体或梳理日常财税流程的超级个体。", includes: ["一次线上咨询", "问题清单预审", "会后行动摘要"], excludes: ["出具正式鉴证意见", "代理申报", "复杂股权架构设计"], materials: ["背景说明", "拟咨询问题", "现有主体信息"], deliverables: ["咨询会议", "行动摘要"], revision: "REV.01" },
  { slug: "trademark-application", code: "OPC/IP/001", category: "知识产权", name: "单类别商标注册申请", price: "¥799 起", period: "以官方流程为准", audience: "需要为产品或品牌申请中国大陆商标的经营者。", includes: ["一个商标一个类别的基础检索", "材料整理", "申请提交"], excludes: ["驳回复审", "异议答辩", "复杂近似分析"], materials: ["申请主体材料", "商标图样或文字", "拟使用范围"], deliverables: ["申请材料", "官方受理文件"], revision: "REV.01" },
  { slug: "software-copyright", code: "OPC/IP/002", category: "知识产权", name: "软件著作权材料整理与申报", price: "¥1,499", period: "以官方流程为准", audience: "拥有可提交版本的软件产品或代码成果的一人公司。", includes: ["基础材料检查", "代码与说明书整理指引", "申请提交"], excludes: ["源代码代写", "权属争议处理", "加急官方费用"], materials: ["主体材料", "软件说明", "源代码样本"], deliverables: ["申报材料", "官方流程文件"], revision: "REV.01" },
  { slug: "icp-precheck", code: "OPC/FILING/001", category: "申报与备案", name: "ICP 备案材料预审", price: "¥499", period: "3 个工作日", audience: "准备在中国大陆服务器上线网站的经营主体。", includes: ["主体与域名材料检查", "网站信息检查", "提交前问题清单"], excludes: ["代替接入商提交", "许可证申请", "不符合政策业务整改"], materials: ["主体证件", "域名信息", "网站说明"], deliverables: ["材料预审结果", "补正清单"], revision: "REV.01" },
  { slug: "first-hire-pack", code: "OPC/HR/001", category: "人力资源", name: "首位员工入职文件包", price: "¥999", period: "5 个工作日", audience: "准备首次招聘全职员工的一人公司。", includes: ["劳动合同基础模板", "保密与知识产权条款", "入职材料清单"], excludes: ["高级管理人员激励", "劳务争议处理", "境外雇佣"], materials: ["主体信息", "岗位信息", "薪酬与试用期方案"], deliverables: ["入职文件包", "使用说明"], revision: "REV.01" },
  { slug: "founder-media-pack", code: "OPC/MEDIA/001", category: "传媒与传播", name: "创始人基础媒体资料包", price: "¥1,999", period: "7 个工作日", audience: "需要统一对外介绍产品、团队与创始人的早期项目。", includes: ["创始人简介", "产品标准介绍", "媒体问答基础版"], excludes: ["媒体投放", "舆情处置", "新闻稿代发"], materials: ["创始人与产品背景", "关键数据", "已有公开资料"], deliverables: ["媒体资料包", "版本维护清单"], revision: "REV.01" },
];

export const projects: TrendProject[] = [
  { owner: "northstar-labs", repo: "relay", rank: 1, change: "上升 4", category: "Agent", description: "为长任务提供可恢复状态与人工确认点的轻量运行时。", language: "TypeScript", stars: 12840, delta24: 684, delta7: 1922, license: "Apache-2.0", updated: "2 小时前", captured: "2026.07.21 14:00", fit: "适合需要把多步自动化交给 Agent，同时保留人工确认边界的一人公司。" },
  { owner: "carbon-stack", repo: "memoryline", rank: 2, change: "新入榜", category: "记忆", description: "可审计、可修订、可删除的 Agent 长期记忆层。", language: "Python", stars: 7621, delta24: 519, delta7: 1540, license: "MIT", updated: "4 小时前", captured: "2026.07.21 14:00", fit: "适合构建需要长期客户或项目上下文的个人工作系统。" },
  { owner: "open-workbench", repo: "mcp-audit", rank: 3, change: "下降 1", category: "MCP", description: "在安装前检查 MCP 服务权限、外部请求和密钥处理。", language: "Rust", stars: 19102, delta24: 430, delta7: 1318, license: "Apache-2.0", updated: "1 小时前", captured: "2026.07.21 14:00", fit: "适合经常试用外部工具连接、需要降低供应链风险的开发者。" },
  { owner: "small-models", repo: "routekit", rank: 4, change: "上升 7", category: "模型路由", description: "按成本、延迟和恢复率为不同任务选择模型。", language: "Python", stars: 5934, delta24: 388, delta7: 1014, license: "MIT", updated: "5 小时前", captured: "2026.07.21 14:00", fit: "适合模型调用已经形成稳定成本、需要精细控制毛利的 AI 产品。" },
  { owner: "silent-systems", repo: "briefcase", rank: 5, change: "保持", category: "Skill", description: "把重复业务流程封装为带输入边界和验收标准的 Skill。", language: "TypeScript", stars: 8430, delta24: 312, delta7: 989, license: "MIT", updated: "7 小时前", captured: "2026.07.21 14:00", fit: "适合已经拥有稳定清单，希望逐步把流程交给 Agent 的经营者。" },
  { owner: "voice-foundry", repo: "streamtalk", rank: 6, change: "下降 3", category: "语音", description: "端侧流式语音合成、打断检测与语义恢复组件。", language: "C++", stars: 24190, delta24: 277, delta7: 920, license: "Apache-2.0", updated: "3 小时前", captured: "2026.07.21 14:00", fit: "适合原型化实时语音助手或低延迟客服体验。" },
  { owner: "solo-ops", repo: "ledger", rank: 7, change: "上升 2", category: "自动化", description: "用事件账本连接客户、合同、发票和交付状态。", language: "Go", stars: 4420, delta24: 241, delta7: 802, license: "AGPL-3.0", updated: "6 小时前", captured: "2026.07.21 14:00", fit: "适合希望用一个可追溯系统替代多个松散表格的一人公司。" },
  { owner: "context-labs", repo: "handoff", rank: 8, change: "新入榜", category: "上下文", description: "在不同 Agent 和人工步骤之间传递最小必要上下文。", language: "TypeScript", stars: 3105, delta24: 219, delta7: 640, license: "MIT", updated: "2 小时前", captured: "2026.07.21 14:00", fit: "适合工具较多但信息经常在切换中丢失的个人工作流。" },
  { owner: "paperplane-ai", repo: "extractor", rank: 9, change: "下降 1", category: "数据", description: "从长文档提取带来源定位的结构化事实。", language: "Python", stars: 15602, delta24: 184, delta7: 588, license: "Apache-2.0", updated: "9 小时前", captured: "2026.07.21 14:00", fit: "适合需要把公告、合同或研究资料转为结构化记录的任务。" },
  { owner: "local-first-ai", repo: "cabinet", rank: 10, change: "上升 3", category: "知识库", description: "本地优先的个人与项目知识柜，支持明确的数据生命周期。", language: "Kotlin", stars: 9874, delta24: 162, delta7: 510, license: "MPL-2.0", updated: "11 小时前", captured: "2026.07.21 14:00", fit: "适合重视数据控制和离线可用性的长期知识工作。" },
  { owner: "metered-ai", repo: "margin", rank: 11, change: "下降 5", category: "成本", description: "按客户、任务和模型追踪推理成本与毛利。", language: "Go", stars: 7200, delta24: 140, delta7: 462, license: "MIT", updated: "12 小时前", captured: "2026.07.21 14:00", fit: "适合需要把模型成本落实到具体客户与工作流的产品。" },
  { owner: "plain-agents", repo: "humancheck", rank: 12, change: "保持", category: "Agent", description: "为高风险工具调用加入可配置的人工确认契约。", language: "TypeScript", stars: 5328, delta24: 126, delta7: 401, license: "MIT", updated: "8 小时前", captured: "2026.07.21 14:00", fit: "适合自动化已触及付款、发布或删除等外部操作的团队。" },
];

export const frontierEntries: FrontierEntry[] = [
  { rank: 1, repo: "northstar-labs/relay", description: "可恢复的长任务 Agent 运行时", baseline: 10122, current: 12840, delta: 2718, submitted: "2026.07.02" },
  { rank: 2, repo: "carbon-stack/memoryline", description: "可审计的长期记忆层", baseline: 5220, current: 7621, delta: 2401, submitted: "2026.07.04" },
  { rank: 3, repo: "open-workbench/mcp-audit", description: "MCP 服务安全审计工具", baseline: 16988, current: 19102, delta: 2114, submitted: "2026.07.01" },
  { rank: 4, repo: "small-models/routekit", description: "成本感知的模型路由", baseline: 4078, current: 5934, delta: 1856, submitted: "2026.07.06" },
  { rank: 5, repo: "silent-systems/briefcase", description: "业务流程 Skill 封装工具", baseline: 6950, current: 8430, delta: 1480, submitted: "2026.07.03" },
  { rank: 6, repo: "solo-ops/ledger", description: "一人公司事件账本", baseline: 3204, current: 4420, delta: 1216, submitted: "2026.07.08" },
  { rank: 7, repo: "context-labs/handoff", description: "Agent 间最小上下文传递", baseline: 2102, current: 3105, delta: 1003, submitted: "2026.07.11" },
  { rank: 8, repo: "paperplane-ai/extractor", description: "带来源定位的事实提取", baseline: 14880, current: 15602, delta: 722, submitted: "2026.07.09" },
];

export const prizes = ["端侧 AI 工作站一台", "年度云算力额度", "开源项目法律体检", "品牌与媒体资料包", "开发者工具年度订阅", "专业录音设备"];

export const historicalWinners = [
  { season: "2026 春季", repo: "field-notes/atlas", rank: 1, prize: "端侧 AI 工作站" },
  { season: "2026 春季", repo: "micro-studio/queue", rank: 2, prize: "年度云算力额度" },
  { season: "2026 春季", repo: "open-contracts/plain", rank: 3, prize: "开源项目法律体检" },
  { season: "2025 冬季", repo: "one-person-os/logbook", rank: 1, prize: "开发者工具年度订阅" },
];

export function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
