export type OpcServiceKind = "infrastructure" | "specialty";

export type OpcService = {
  kind: OpcServiceKind;
  slug: string;
  code: string;
  name: string;
  domain: string;
  outcome: string;
  audience: string;
  includes: string[];
  deliverables: string[];
  materials: string[];
  boundary: string;
  price: string;
  period: string;
  revision: string;
  status: string;
};

export type RangerProfile = {
  slug: string;
  publicName: string;
  identity: string;
  intro: string;
  tags: string[];
  credential?: string;
  contactLabel: string;
  contactState: string;
};

const previewFacts = {
  price: "待专业确认",
  period: "待专业确认",
  revision: "DRAFT.01",
  status: "内容建模中",
};

function infrastructure(
  code: string,
  slug: string,
  name: string,
  outcome: string,
  audience: string,
  includes: string[],
  boundary: string,
): OpcService {
  return {
    kind: "infrastructure",
    code,
    slug,
    name,
    domain: "基础设施",
    outcome,
    audience,
    includes,
    deliverables: ["可运行状态说明", "交付与维护清单", "后续复查节点"],
    materials: ["经营主体或项目基础信息", "现有材料与账号清单", "需要由经营者作出的关键决定"],
    boundary,
    ...previewFacts,
  };
}

function specialty(
  code: string,
  slug: string,
  domain: string,
  name: string,
  outcome: string,
  boundary: string,
): OpcService {
  return {
    kind: "specialty",
    code,
    slug,
    domain,
    name,
    outcome,
    audience: "需要在固定范围内完成一次明确专业处理的超级个体或 OPC。",
    includes: ["限定事实和材料范围", "形成一个主要专业结果", "说明后续行动与升级条件"],
    deliverables: [outcome, "问题与边界说明", "下一步处理清单"],
    materials: ["问题背景与目标", "已有文件、记录或链接", "与本次判断相关的最少事实"],
    boundary,
    ...previewFacts,
  };
}

export const infrastructureServices: OpcService[] = [
  infrastructure("OPC/INFRA/001", "entity-and-compliance", "主体设立与基础合规", "使经营主体完成设立并具备可持续维护的基础合规记录。", "准备开始经营或需要梳理主体基础状态的个人创业者。", ["主体类型与注册地适用性", "基础治理、证照、账户与税务初始化", "首年期限和维护清单"], "复杂股权、代持、跨境架构或特殊许可业务转交游骑兵。"),
  infrastructure("OPC/INFRA/002", "contracts-and-transactions", "合同与交易基础", "使报价、签约、交付、验收、开票和回款形成基础交易闭环。", "需要把临时成交变成可复用交易流程的经营者。", ["报价、合同与签署规则", "交付、变更、验收与回款凭证", "交易证据归档"], "重大交易、复杂谈判、正式争议或高额责任项目转交游骑兵。"),
  infrastructure("OPC/INFRA/003", "finance-and-tax", "财税核算基础", "使收入、票据、支出、申报和关账形成周期性闭环。", "已经产生收入或准备稳定经营的 OPC。", ["收入、票据与支出记录口径", "申报、关账和材料收集节奏", "财税摘要与异常提示"], "税务稽查、历史重建或复杂跨境税务安排转交游骑兵。"),
  infrastructure("OPC/INFRA/004", "workforce-and-collaboration", "用工与协作基础", "使员工、外包人员和长期协作者能够规范进入、工作和退出。", "从独自工作走向雇佣、外包或长期协作的 OPC。", ["关系判断、基础文件与权限边界", "入职、交付、账号与资料交接", "终止合作和权限回收规则"], "高管、境外雇佣、裁员、工伤或重大劳动争议转交游骑兵。"),
  infrastructure("OPC/INFRA/005", "intellectual-property", "知识产权基础", "使品牌、代码、内容和核心成果具备清晰的权属与使用记录。", "正在积累品牌或数字资产、需要先理清权属的经营者。", ["核心成果与权属盘点", "第三方素材、模型和开源使用记录", "保护与维护日历"], "已发生权属争议、国际布局或复杂联合开发转交游骑兵。"),
  infrastructure("OPC/INFRA/006", "data-and-privacy", "数据与隐私基础", "使产品的数据收集、处理、共享与公开告知形成可检查的基础边界。", "运营网站、App、AI 功能或在线服务的经营者。", ["数据与处理活动清单", "隐私文本、界面告知和第三方处理方记录", "变更后的复查规则"], "大规模敏感信息、强监管用途和复杂跨境数据安排转交游骑兵。"),
  infrastructure("OPC/INFRA/007", "brand-and-content-assets", "品牌与内容资产基础", "使品牌、域名、账号和内容资产具备一致归属与维护记录。", "通过品牌、内容或公开渠道持续经营的创作者与 OPC。", ["品牌、域名、账号与内容资产盘点", "授权和使用边界", "关键资产维护与交接清单"], "复杂 MCN 关系、重大侵权争议或多法域品牌布局转交游骑兵。"),
  infrastructure("OPC/INFRA/008", "product-delivery", "产品交付基础", "使产品范围、版本、交付、验收和支持形成可复用流程。", "需要持续交付数字或专业产品的经营者。", ["产品范围和版本规则", "交付、验收、变更和支持边界", "发布与复查清单"], "强监管产品、重大定制项目或正式质量争议转交游骑兵。"),
  infrastructure("OPC/INFRA/009", "software-and-automation", "软件与自动化基础", "使代码、部署、账号、自动化和恢复具备最低可维护性。", "依赖软件、云服务或自动化完成经营交付的 OPC。", ["代码、部署与关键账号清单", "自动化权限和运行边界", "备份、恢复与交接节点"], "复杂安全审计、高可用架构或重大事故响应转交游骑兵。"),
  infrastructure("OPC/INFRA/010", "ai-application-governance", "AI 应用治理基础", "使 AI 功能的数据、模型、提示、人工边界和变更形成可追溯记录。", "正在把生成式 AI 或模型服务用于产品和经营流程的 OPC。", ["AI 用途、输入输出与数据边界", "模型供应方、人工复核和风险提示", "版本、监控与停用规则"], "强监管用途、重大模型安全风险或正式备案事项转交游骑兵。"),
];

export const specialtyDomains = ["法律", "财税与财务", "人力资源", "知识产权", "数据与数字合规"] as const;

export const specialtyServices: OpcService[] = [
  specialty("OPC/LEGAL/001", "legal-health-check", "法律", "经营法律体检", "一份经营法律风险分级报告和整改优先级。", "需要正式法律意见、复杂谈判或争议代理时转交游骑兵。"),
  specialty("OPC/LEGAL/002", "commercial-contract", "法律", "单项商业合同专项", "一份可用于明确交易边界的商业合同或修订意见。", "融资、并购、重大跨境交易和争议合同转交游骑兵。"),
  specialty("OPC/LEGAL/003", "corporate-governance", "法律", "公司治理专项", "一组可签署或归档的治理文件和权限说明。", "复杂股权、控制权冲突、代持或融资安排转交游骑兵。"),
  specialty("OPC/LEGAL/004", "commercial-rules", "法律", "商业规则与宣传合规审查", "一套可以公开使用的商业规则或宣传文本。", "强监管商品、重大公共争议或正式专项法律意见转交游骑兵。"),
  specialty("OPC/LEGAL/005", "pre-dispute", "法律", "履约异常与争议前处理", "一份事实与证据清单、标准通知和下一步行动方案。", "已进入正式索赔、仲裁或诉讼的事项转交游骑兵。"),
  specialty("OPC/FIN/001", "finance-health-check", "财税与财务", "财税健康体检", "一份确定期间内的财税风险分级报告和整改清单。", "税务稽查、重大漏报和历史账务重建转交游骑兵。"),
  specialty("OPC/FIN/002", "tax-burden-model", "财税与财务", "主体与商业模式税负测算", "一份基于明确假设的主体、收入模式和税负比较。", "复杂股权、跨境税务架构和专项筹划转交游骑兵。"),
  specialty("OPC/FIN/003", "funds-cleanup", "财税与财务", "公私资金与股东往来清理", "一份资金往来分类表、凭证缺口清单和规范化方案。", "无法解释的大额资金、涉嫌违法交易和重大税务风险转交游骑兵。"),
  specialty("OPC/FIN/004", "single-transaction-tax", "财税与财务", "单项交易财税处理", "一笔明确交易的合同、发票、税务、入账和凭证处理说明。", "复杂跨境交易、股权交易、重组和正式鉴证事项转交游骑兵。"),
  specialty("OPC/FIN/005", "profit-cashflow", "财税与财务", "经营利润与现金流诊断", "一份面向创业者的利润、现金和行动结论。", "融资顾问、估值、投资建议和复杂管理会计不属于本服务。"),
  specialty("OPC/HR/001", "workforce-model", "人力资源", "用工方式判断", "针对一个明确岗位或合作需求形成关系选择和风险说明。", "境外雇佣、高管、合伙人和股权激励转交游骑兵。"),
  specialty("OPC/HR/002", "first-hire", "人力资源", "首次用工专项", "使一名首位员工在固定范围内完成规范入职。", "特殊工时、境外用工和历史用工问题转交游骑兵。"),
  specialty("OPC/HR/003", "long-term-collaborator", "人力资源", "外包与长期协作者专项", "为一次明确外部合作建立工作、交付、权属和退出边界。", "可能已形成劳动关系或重大技术合作转交游骑兵。"),
  specialty("OPC/HR/004", "employment-risk-check", "人力资源", "在岗用工风险体检", "一份现有少量员工或协作者的风险报告和整改优先级。", "工伤、仲裁、群体性问题和重大历史欠缴情形转交游骑兵。"),
  specialty("OPC/HR/005", "exit-plan", "人力资源", "离职与解除预案", "针对一名员工或协作者形成退出路径、交接清单和固定范围文件。", "单方辞退、裁员、工伤、仲裁和高度争议事项转交游骑兵。"),
  specialty("OPC/IP/001", "brand-protection", "知识产权", "核心品牌保护方案", "一个核心品牌或产品名称的可用性、保护范围和申请优先级方案。", "多法域布局、驰名商标和复杂在先权利问题转交游骑兵。"),
  specialty("OPC/IP/002", "trademark-maintenance", "知识产权", "商标确权与维护", "完成一项明确的商标注册、续展、变更或转让事项。", "异议、无效、驳回复审和侵权争议转交游骑兵。"),
  specialty("OPC/IP/003", "software-content-rights", "知识产权", "软件与内容确权", "使一项软件或内容成果形成明确权属记录和标准确权材料。", "专利、联合创作争议和复杂国际登记转交游骑兵。"),
  specialty("OPC/IP/004", "ownership-chain", "知识产权", "成果权属链审查", "一项核心产品或内容资产的权属链图、缺口和补正方案。", "已发生权属争议、多人重大联合开发和跨境权利冲突转交游骑兵。"),
  specialty("OPC/IP/005", "third-party-rights", "知识产权", "第三方授权与开源合规审查", "一项产品使用外部代码、模型、数据和素材的合规清单。", "复杂许可证冲突、正式侵权意见和重大技术并购审查转交游骑兵。"),
  specialty("OPC/DATA/001", "digital-product-check", "数据与数字合规", "数字产品合规体检", "一个数字产品的合规风险报告和上线整改优先级。", "多模块整改进入基础设施；重大专业判断转交游骑兵。"),
  specialty("OPC/DATA/002", "privacy-processing", "数据与数字合规", "个人信息处理与隐私专项", "一个产品的个人信息处理清单、界面提示和隐私文本。", "大规模敏感信息、未成年人和正式影响评估转交游骑兵。"),
  specialty("OPC/DATA/003", "ai-feature-review", "数据与数字合规", "AI 功能合规审查", "一个明确 AI 功能的数据、标识、协议和监管适用性检查结果。", "强监管用途、正式备案和重大模型安全风险转交游骑兵。"),
  specialty("OPC/DATA/004", "data-supply-chain", "数据与数字合规", "第三方数据供应链审查", "外部 SDK、云服务、模型 API 等处理方的数据流与风险清单。", "复杂安全审计、供应链事件和重要数据处理转交游骑兵。"),
  specialty("OPC/DATA/005", "cross-border-data", "数据与数字合规", "数据跨境适用性预审", "一条明确数据路径的跨境事实图、风险等级和升级处理建议。", "正式跨境数据申报、重要数据和复杂多法域安排转交游骑兵。"),
];

export const rangerIdentities = ["法律顾问", "财税顾问", "知识产权顾问", "创业顾问", "产品顾问", "品牌顾问", "自媒体专家", "设计师", "软件工程顾问", "AI 开发专家"] as const;

export const rangerProfiles: RangerProfile[] = [
  { slug: "ranger-legal-preview", publicName: "公开档案示例 A01", identity: "法律顾问", intro: "面向小型商业合作、交易边界与早期风险判断。", tags: ["商业交易", "合同", "风险判断"], credential: "职业资质或公开经历将在本人授权后展示。", contactLabel: "联系方式将在本人确认后公开", contactState: "PROFILE PREVIEW" },
  { slug: "ranger-finance-preview", publicName: "公开档案示例 B02", identity: "财税顾问", intro: "关注经营现金、财税边界与复杂事项的前期判断。", tags: ["经营财务", "税务", "跨境"], contactLabel: "联系方式将在本人确认后公开", contactState: "PROFILE PREVIEW" },
  { slug: "ranger-ip-preview", publicName: "公开档案示例 C03", identity: "知识产权顾问", intro: "围绕品牌、成果权属和第三方使用形成专业判断。", tags: ["商标", "权属", "开源合规"], contactLabel: "联系方式将在本人确认后公开", contactState: "PROFILE PREVIEW" },
  { slug: "ranger-founder-preview", publicName: "公开档案示例 D04", identity: "创业顾问", intro: "支持经营路径、协作关系与关键阶段选择的讨论。", tags: ["经营策略", "协作", "增长"], contactLabel: "联系方式将在本人确认后公开", contactState: "PROFILE PREVIEW" },
  { slug: "ranger-product-preview", publicName: "公开档案示例 E05", identity: "产品顾问", intro: "支持从用户问题到产品路径的非标准化一对一讨论。", tags: ["产品策略", "用户研究", "SaaS"], contactLabel: "联系方式将在本人确认后公开", contactState: "PROFILE PREVIEW" },
  { slug: "ranger-brand-preview", publicName: "公开档案示例 F06", identity: "品牌顾问", intro: "帮助创作者与产品建立可延续的公共表达方式。", tags: ["品牌策略", "定位", "表达"], contactLabel: "联系方式将在本人确认后公开", contactState: "PROFILE PREVIEW" },
  { slug: "ranger-media-preview", publicName: "公开档案示例 G07", identity: "自媒体专家", intro: "面向内容生产、平台协作与个人表达的个案问题。", tags: ["内容", "直播", "平台"], contactLabel: "联系方式将在本人确认后公开", contactState: "PROFILE PREVIEW" },
  { slug: "ranger-design-preview", publicName: "公开档案示例 H08", identity: "设计师", intro: "在品牌、产品和界面之间建立一致的视觉判断。", tags: ["品牌系统", "界面", "内容设计"], contactLabel: "联系方式将在本人确认后公开", contactState: "PROFILE PREVIEW" },
  { slug: "ranger-engineering-preview", publicName: "公开档案示例 I09", identity: "软件工程顾问", intro: "针对系统架构、工程路径与长期维护提供判断。", tags: ["架构", "工程", "开源"], contactLabel: "联系方式将在本人确认后公开", contactState: "PROFILE PREVIEW" },
  { slug: "ranger-ai-preview", publicName: "公开档案示例 J10", identity: "AI 开发专家", intro: "围绕 AI 产品、模型能力与工程路线提供个案判断。", tags: ["AI 产品", "模型应用", "工程路线"], contactLabel: "联系方式将在本人确认后公开", contactState: "PROFILE PREVIEW" },
];

export const allOpcServices = [...infrastructureServices, ...specialtyServices];

export function getOpcService(kind: OpcServiceKind, slug: string) {
  return allOpcServices.find((service) => service.kind === kind && service.slug === slug);
}

export function getRangerProfile(slug: string) {
  return rangerProfiles.find((profile) => profile.slug === slug);
}
