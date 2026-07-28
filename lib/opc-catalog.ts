import {
  selectedInfrastructureGroups,
  selectedInfrastructureServices,
  selectedSpecialtyDomains,
  selectedSpecialtyServices,
} from "./opc-selected-skus.ts";

export type OpcServiceKind = "infrastructure" | "specialty";

export type OpcService = {
  kind: OpcServiceKind;
  slug: string;
  code: string;
  name: string;
  domain: string;
  group: string;
  outcome: string;
  audience: string;
  includes: string[];
  deliverables: string[];
  materials: string[];
  acceptance?: string[];
  boundary: string;
  price: string;
  feeNote?: string;
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
  verificationDate?: string;
  profileUpdatedAt?: string;
  authorizationStatus?: string;
};

export type OpcCatalogContent = {
  infrastructure: OpcService[];
  specialties: OpcService[];
  rangers: RangerProfile[];
};

const previewFacts = {
  price: "待专业确认",
  period: "待专业确认",
  revision: "DRAFT.01",
  status: "内容建模中",
};

type InfrastructureInput = Omit<
  OpcService,
  "kind" | "domain" | "price" | "revision" | "status"
>;

function infrastructure(input: InfrastructureInput): OpcService {
  return {
    kind: "infrastructure",
    ...input,
    domain: "基础设施",
    price: "固定服务费待业务确认；政府、平台及第三方费用另计",
    revision: "RESEARCH.01",
    status: "需求研究稿",
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
    group: domain,
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

export const researchInfrastructureServices: OpcService[] = [
  infrastructure({
    code: "OPC/INFRA/001",
    slug: "entity-startup-and-governance",
    name: "经营主体启动与治理",
    group: "建立经营底座",
    outcome: "让经营者选对主体路径，并把登记、账户、税务、印章和首年治理接成可运行底座。",
    audience: "准备持续收费、需要对公签约或开票，或已经设立个体工商户、个人独资企业、一人有限责任公司但基础档案不完整的经营者。",
    includes: [
      "自然人经营、个体工商户与公司等主体路径及注册地适用性",
      "名称、经营范围、注册资本、任职与基础治理决定",
      "登记、印章、银行账户、税务与发票能力的启动衔接",
      "电子营业执照、政务与银行账号的控制权和恢复方式",
      "公私财产边界、书面决定与基础证据档案",
      "年报、申报、出资和证照维护的首年日历",
    ],
    deliverables: ["主体路径与关键决定书", "开业事项完成及缺口清单", "主体档案目录与首年维护日历"],
    materials: ["经营者身份、居住地与拟经营地区信息", "业务模式、客户类型、收入渠道与开票需求", "拟用名称、经营范围、注册资本和任职安排", "已有主体、证照、印章、账户及历史申报资料"],
    boundary: "代持、复杂股权或控制权安排、外商投资、境外主体参与、特殊许可行业，以及已经存在的公司人格混同或股东争议，转交对应游骑兵处理。",
    period: "材料齐备后 7–15 个工作日；登记、开户等官方时间另计",
  }),
  infrastructure({
    code: "OPC/INFRA/002",
    slug: "finance-tax-and-business-funds",
    name: "财税与经营资金运行",
    group: "建立经营底座",
    outcome: "让收入、开票、支出、申报、关账和经营现金形成可重复的周期性闭环。",
    audience: "已经产生经营收入，或准备通过主体、平台、内容、软件及专业服务持续收付款的经营者。",
    includes: [
      "经营账户与个人账户的收支边界",
      "收入、平台结算、退款和应收款的记录口径",
      "数电发票的开具、红冲、取得与归档流程",
      "采购、报销、成本费用与凭证收集规则",
      "月度、季度、年度申报和关账日历",
      "经营利润、现金余额、税费和异常事项的一页摘要",
    ],
    deliverables: ["财税运行流程与责任表", "票据凭证目录及申报关账日历", "经营摘要模板与首期异常清单"],
    materials: ["主体和税务基础信息", "近一期银行、支付平台、发票和费用记录", "收入模式、定价、退款及主要收付款渠道", "现有记账、申报和历史异常资料"],
    boundary: "持续代理记账、审计鉴证、税务稽查或争议、长期未申报、重大历史账务重建、复杂税收筹划和跨境税务架构不在标准范围内。",
    period: "材料齐备后 7–10 个工作日；不含持续记账与申报服务",
  }),
  infrastructure({
    code: "OPC/INFRA/003",
    slug: "contracts-transactions-and-collections",
    name: "合同、交易与回款运行",
    group: "建立经营底座",
    outcome: "让报价、签约、交付、验收、开票、回款和证据留存形成一条一致的交易链。",
    audience: "依赖项目制服务、数字产品、内容合作、订阅或采购协作成交，但目前主要靠聊天记录和临时文件推进的经营者。",
    includes: [
      "客户、供应商与签约主体的基础核验",
      "报价单、工作范围、保密和常用交易合同模板",
      "签署授权、电子签署和合同版本管理规则",
      "预付款、里程碑、尾款、退款与逾期处理规则",
      "交付、变更、验收、开票和回款的对应凭证",
      "催款、暂停、终止及交易证据归档流程",
    ],
    deliverables: ["标准交易文件包", "从报价到回款的流程与控制点", "交易证据目录及异常处理模板"],
    materials: ["代表性客户、供应商与历史交易样本", "现有报价、合同、聊天、交付和收款记录", "产品或服务范围、定价、交付和退款规则", "可接受与不可接受的交易风险边界"],
    boundary: "融资并购、重大许可、高额或强监管交易、复杂谈判、已经发生的违约索赔、仲裁诉讼，以及无法预先固定责任边界的项目转交游骑兵。",
    period: "材料齐备后 7–10 个工作日",
  }),
  infrastructure({
    code: "OPC/INFRA/004",
    slug: "online-operations-and-platform-readiness",
    name: "线上经营与平台准入",
    group: "建立经营底座",
    outcome: "让网站、App、小程序、网店、社交账号或直播业务具备一套可核对的公开经营条件。",
    audience: "通过自建站、应用程序、电商平台、社交媒体或直播销售商品、数字内容和服务的经营者。",
    includes: [
      "自建渠道、平台店铺、社交账号和直播场景的经营路线图",
      "经营主体登记、行政许可、ICP备案或APP备案的适用性清单",
      "主体、许可、联系方式和经营状态的公开展示要求",
      "用户协议、交易规则、明码标价、退款和消费者权益入口",
      "广告、推荐、代言、直播话术与内容发布的基础审查流程",
      "平台入驻材料、审核证据和规则变化复查清单",
    ],
    deliverables: ["线上经营渠道与准入地图", "公开信息及交易规则文件包", "上线验收与平台复查清单"],
    materials: ["拟上线渠道、平台账号和域名应用信息", "商品或服务、目标用户、价格与履约方式", "主体、许可、品牌授权和供应链资料", "现有页面、协议、宣传内容和平台审核反馈"],
    boundary: "新闻、出版、教育、医疗、金融、食品药品等强监管业务，特殊行政许可，平台封禁申诉，重大虚假宣传或消费者群体纠纷转交游骑兵。",
    period: "材料齐备后 10–15 个工作日；备案、许可和平台审核时间另计",
  }),
  infrastructure({
    code: "OPC/INFRA/005",
    slug: "workforce-and-external-collaboration",
    name: "用工与外部协作运行",
    group: "持续安全运行",
    outcome: "让员工、外包人员和长期协作者能够按清楚的关系、权限、成果和退出规则进入经营系统。",
    audience: "准备首次雇人、稳定使用外部个人协作者或外包团队，或需要整顿现有少量协作者关系的 OPC。",
    includes: [
      "劳动、劳务、外包和供应商关系的事实判断",
      "招聘、录用、入职和实名档案的基础流程",
      "劳动合同、外包合同、工作范围与验收文件",
      "薪酬、社保、公积金、工时休假和支付接口",
      "保密、知识产权、个人信息和系统访问边界",
      "离职终止、工作交接、设备资料和权限回收",
    ],
    deliverables: ["关系选择与风险矩阵", "入职、协作、交付及退出文件包", "人员权限与档案维护清单"],
    materials: ["岗位或外包任务、工作方式与管理要求", "拟合作人员身份、地点、期限和报酬安排", "涉及的代码、内容、数据、账号和设备", "现有合同、支付、考勤、社保和争议记录"],
    boundary: "高管或合伙人安排、股权激励、境外雇佣、劳务派遣、裁员、工伤、劳动仲裁以及已经高度混同的历史用工转交游骑兵。",
    period: "材料齐备后 7–10 个工作日",
  }),
  infrastructure({
    code: "OPC/INFRA/006",
    slug: "intellectual-property-and-digital-assets",
    name: "知识产权与数字资产运行",
    group: "持续安全运行",
    outcome: "让品牌、代码、内容、域名、账号和关键成果具备清楚的权属、授权、控制权与维护记录。",
    audience: "持续创作内容、开发软件、经营品牌，或依赖域名、代码仓库、平台账号和第三方素材形成收入的经营者。",
    includes: [
      "商标、作品、软件、域名、账号与商业秘密资产盘点",
      "创始人、员工、外包和合作方成果的权属链",
      "商标、著作权和软件登记的保护优先级及日历",
      "开源代码、模型、数据、字体、图片和音视频授权记录",
      "创作过程、版本、首次发布和商业使用证据",
      "核心账号控制权、续费、授权使用和交接安排",
    ],
    deliverables: ["核心资产总表与权属链图", "权属补正及保护优先级方案", "第三方授权、维护和交接日历"],
    materials: ["品牌名称、作品、代码、域名和账号清单", "创作、开发、委托、合作和付款记录", "已签合同、授权证明、许可证及登记证书", "代码依赖、模型数据和素材来源清单"],
    boundary: "专利布局、国际商标、复杂联合开发或开源许可证冲突、MCN控制权争议，以及已发生的侵权、异议、无效或权属诉讼转交游骑兵。",
    period: "材料齐备后 10–15 个工作日；申请审查时间另计",
  }),
  infrastructure({
    code: "OPC/INFRA/007",
    slug: "data-privacy-and-security",
    name: "数据、隐私与安全运行",
    group: "持续安全运行",
    outcome: "让个人信息和经营数据的收集、使用、共享、保存、删除与安全措施形成可执行且可检查的边界。",
    audience: "运营网站、App、小程序、社群、客户系统或自动化流程，并接触用户、客户、员工或协作者信息的经营者。",
    includes: [
      "个人信息、经营数据、处理角色和数据流清单",
      "处理目的、最小必要、敏感信息和未成年人场景判断",
      "隐私政策、分层告知、同意和个人权利入口",
      "SDK、云服务、模型API和外部处理方清单及合同边界",
      "保存期限、删除、备份、访问控制、认证和日志规则",
      "数据事件响应、处理活动变化和跨境适用性复查",
    ],
    deliverables: ["数据处理活动与流向图", "隐私告知、供应链及内部规则文件包", "安全基线、事件响应和变更复查清单"],
    materials: ["产品功能、页面、表单和用户旅程", "数据库字段、日志、Cookie、SDK和第三方服务清单", "现有隐私文本、授权界面与供应商合同", "账号权限、备份、安全事件及跨境访问情况"],
    boundary: "大规模或重要数据、敏感个人信息高风险处理、未成年人核心业务、等保测评、正式个人信息保护影响评估、数据出境申报和重大安全事件转交游骑兵。",
    period: "材料齐备后 10–15 个工作日",
  }),
  infrastructure({
    code: "OPC/INFRA/008",
    slug: "product-delivery-and-customer-protection",
    name: "产品交付、售后与客户保障",
    group: "构建与交付",
    outcome: "让产品或服务的范围、版本、交付、验收、支持、退款和投诉形成可重复的客户履约系统。",
    audience: "销售软件、数字内容、订阅、课程或专业服务，并需要减少范围漂移、重复沟通和交付争议的经营者。",
    includes: [
      "产品服务范围、版本、可用条件和不承诺事项",
      "报价、工作范围、里程碑、变更与验收机制",
      "发布、交付、质量检查和客户确认凭证",
      "支持渠道、响应口径、服务期限和知识库",
      "取消、退款、投诉、缺陷修复和必要召回流程",
      "客户反馈、复盘和产品规则更新机制",
    ],
    deliverables: ["产品交付基线与责任边界", "交付、验收、变更及支持模板", "客户保障与异常处理清单"],
    materials: ["产品或服务说明、价格、版本和销售页面", "代表性项目、交付物、客户沟通与售后记录", "现有合同、退款、支持和质量规则", "主要失败场景、客户承诺和可接受损失边界"],
    boundary: "重大定制、强监管产品、正式质量鉴定、群体消费者争议、产品责任事故和已经进入索赔程序的事项转交游骑兵。",
    period: "材料齐备后 7–10 个工作日",
  }),
  infrastructure({
    code: "OPC/INFRA/009",
    slug: "software-accounts-and-automation-operations",
    name: "技术底座、账号与自动化运维",
    group: "构建与交付",
    outcome: "让代码、云服务、关键账号和自动化任务不再只存在于经营者记忆中，并具备恢复和交接能力。",
    audience: "依赖网站、SaaS、云服务、代码、Agent或自动化流程完成销售、运营和交付的经营者。",
    includes: [
      "代码仓库、域名、云资源、SaaS、支付和自动化资产清单",
      "所有权、管理员、最小权限、多因素认证和恢复方式",
      "开发生产隔离、密钥、API令牌和供应商访问规则",
      "部署、定时任务、监控、日志和失败通知",
      "数据备份、恢复演练、版本回退和人工接管",
      "供应商停服、人员离开与业务交接预案",
    ],
    deliverables: ["数字系统资产与权限矩阵", "部署监控、故障和人工接管运行手册", "备份恢复证据及交接包"],
    materials: ["域名、仓库、云资源、SaaS和自动化清单", "管理员、协作者、服务账号与权限现状", "部署流程、密钥位置、监控和故障记录", "数据备份、恢复目标和关键供应商合同"],
    boundary: "复杂架构重构、渗透测试、等级保护、高可用系统、7×24小时运维、重大安全事故和长期代运维不在标准范围内。",
    period: "材料齐备后 10–15 个工作日",
  }),
  infrastructure({
    code: "OPC/INFRA/010",
    slug: "ai-application-and-content-governance",
    name: "AI 应用与内容治理",
    group: "构建与交付",
    outcome: "让 AI 的用途、模型、数据、内容标识、人工复核和版本变化形成可追溯的产品治理记录。",
    audience: "把生成式AI用于对外产品、自动决策、内容生产、客户服务或内部敏感流程的经营者。",
    includes: [
      "AI使用场景、服务角色、目标用户和禁止用途清单",
      "模型供应方、训练或检索数据、提示与输出的来源边界",
      "个人信息、商业秘密、知识产权和敏感输入规则",
      "人工复核、拒绝响应、错误纠正和用户申诉机制",
      "生成合成内容显式与隐式标识、用户协议和风险提示",
      "备案或安全评估适用性、评测、监控、版本和停用记录",
    ],
    deliverables: ["AI应用治理档案与风险分级", "用户协议、内容标识及内部使用规则", "评测监控、变更复查和停用清单"],
    materials: ["AI功能演示、用户流程和目标用途", "模型、API、知识库、提示及数据来源清单", "输入输出样本、人工复核和异常记录", "现有协议、标识方式、供应商条款和备案资料"],
    boundary: "自研基础模型、面向公众的复杂生成式服务备案或安全评估、强监管领域自动决策、重大模型安全事件和正式算法审计转交游骑兵。",
    period: "材料齐备后 10–15 个工作日；备案或评估时间另计",
  }),
  infrastructure({
    code: "OPC/INFRA/011",
    slug: "cross-border-payments-and-digital-services",
    name: "跨境收付与数字服务",
    group: "持续安全运行",
    outcome: "围绕一条明确跨境业务路线形成合同、收付、税务、数据的事实地图、路径预审和真实性凭证闭环。",
    audience: "向境外客户提供服务、从海外平台取得收入，或采购境外软件、云服务、模型API和专业服务的境内经营者。",
    includes: [
      "交易场景、境内外主体、国家地区与资金方向确认",
      "合同主体、服务内容、币种、定价和结算条款",
      "银行、支付机构、平台账户及真实性材料路线",
      "收入确认、发票、税务、结售汇和手续费记录口径",
      "境外软件与服务采购的合同、支付和入账证据",
      "退款拒付、定期对账、数据跨境和路线复查",
    ],
    deliverables: ["单条跨境交易路线与责任图", "收付、税务和真实性证据模板", "对账、异常和路线复查清单"],
    materials: ["交易对手、平台、国家地区和服务说明", "拟用合同、币种、账户、支付工具和结算周期", "历史订单、账单、银行流水、发票和平台报表", "涉及的数据、云服务、模型及境外访问情况"],
    boundary: "境外设立、外商投资、VIE、复杂转让定价、资本项目、受制裁地区、重要数据出境、正式税务或外汇意见，以及无法固定的多法域路线转交游骑兵。",
    period: "材料齐备后 10–20 个工作日；银行、平台和主管部门时间另计",
  }),
  infrastructure({
    code: "OPC/INFRA/012",
    slug: "business-pause-exit-and-handover",
    name: "经营暂停、退出与交接",
    group: "持续安全运行",
    outcome: "让暂停、注销、出售或经营者暂时无法工作时，合同、资金、人员、数据、账号和资产能够有序收束或交接。",
    audience: "准备停止接单、暂停经营、注销无重大争议主体，或需要为一人经营的单点故障预先建立交接安排的经营者。",
    includes: [
      "暂停、歇业、注销、资产转移或临时接管路径选择",
      "停止接单续费、客户通知、未完成交付和退款安排",
      "应收应付、合同、员工与外部协作关系的收束",
      "税务清理、申报、清算、年报和登记事项清单",
      "个人信息、经营数据、域名、代码、商标与账号处理",
      "证照印章、长期档案、恢复条件和紧急交接包",
    ],
    deliverables: ["暂停退出路径与项目计划", "对外通知、关系收束和办理文件清单", "数据资产处理及紧急交接档案"],
    materials: ["主体、股东、合同、人员和债权债务现状", "税务申报、银行支付和未结交易资料", "用户数据、域名、知识产权、代码及平台账号清单", "拟暂停或退出时间、资产去向和接管人安排"],
    boundary: "资不抵债、无法清偿、破产程序、股东冲突、重大税务风险、行政调查、诉讼仲裁、员工争议和跨境主体退出转交游骑兵。",
    period: "材料齐备后 10–20 个工作日；清算、清税和注销时间另计",
  }),
];

export const researchSpecialtyDomains = ["法律", "财税与财务", "人力资源", "知识产权", "数据与数字合规"] as const;

export const researchSpecialtyServices: OpcService[] = [
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

export const rangerProfiles: RangerProfile[] = [];

export const infrastructureGroups = selectedInfrastructureGroups;
export const infrastructureServices = selectedInfrastructureServices;
export const specialtyDomains = selectedSpecialtyDomains;
export const specialtyServices = selectedSpecialtyServices;

export const allOpcServices = [...infrastructureServices, ...specialtyServices];

export function createDefaultOpcCatalog(): OpcCatalogContent {
  return structuredClone({
    infrastructure: infrastructureServices,
    specialties: specialtyServices,
    rangers: rangerProfiles,
  });
}

export function getOpcService(kind: OpcServiceKind, slug: string) {
  return allOpcServices.find((service) => service.kind === kind && service.slug === slug);
}

export function getRangerProfile(slug: string) {
  return rangerProfiles.find((profile) => profile.slug === slug);
}
