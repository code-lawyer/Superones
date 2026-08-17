import {
  selectedInfrastructureGroups,
  selectedInfrastructureServices,
  selectedSpecialtyDomains,
  selectedSpecialtyServices,
} from "./opc-selected-skus.ts";
import type { RangerAvatarAsset } from "./ranger-avatar.ts";

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

export type RangerIdentity = {
  id: string;
  name: string;
  description: string;
};

export type ServiceCategoryDescription = {
  section: "infrastructure" | "specialties";
  name: string;
  description: string;
};

export type RangerProfile = {
  slug: string;
  publicName: string;
  identityId: string;
  signature?: string;
  avatar?: RangerAvatarAsset;
  /** Legacy read compatibility for drafts created before managed media storage. */
  avatarUrl?: string;
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
  serviceCategoryDescriptions: ServiceCategoryDescription[];
  rangerIdentities: RangerIdentity[];
  rangers: RangerProfile[];
};

export const RANGER_SIGNATURE_MAX_LENGTH = 120;
export const OPC_CATEGORY_DESCRIPTION_MAX_LENGTH = 80;

export const defaultServiceCategoryDescriptions: ServiceCategoryDescription[] = [
  { section: "infrastructure", name: "启动经营", description: "主体设立、财税启用与首年治理" },
  { section: "infrastructure", name: "上线与交付", description: "交易合同、线上准入与回款闭环" },
  { section: "infrastructure", name: "持续安全运行", description: "协作、知识产权与数据安全治理" },
  { section: "specialties", name: "法律与经营风险", description: "合同文件、交易规则与经营合规检查" },
  { section: "specialties", name: "财税与现金流", description: "账税申报、财务体检与经营现金管理" },
  { section: "specialties", name: "品牌与线上获客", description: "品牌定位、基础视觉与销售页面建设" },
  { section: "specialties", name: "AI与企业数字化", description: "AI 工具、流程自动化与内部知识系统" },
  { section: "specialties", name: "用工与协作者", description: "首位员工及长期协作者的关系配置" },
  { section: "specialties", name: "知识产权与产品商业化", description: "商标、成果权属与数字产品上线合规" },
];

export const defaultRangerIdentities: RangerIdentity[] = [
  { id: "legal-advisor", name: "法律顾问", description: "合同、治理与经营风险的独立专业支持" },
  { id: "finance-tax-advisor", name: "财税顾问", description: "账税合规、财务管理与现金流支持" },
  { id: "intellectual-property-advisor", name: "知识产权顾问", description: "商标、专利与成果权属保护" },
  { id: "startup-advisor", name: "创业顾问", description: "商业验证、主体启动与融资准备" },
  { id: "product-advisor", name: "产品顾问", description: "产品定义、用户需求与增长路径" },
  { id: "brand-advisor", name: "品牌顾问", description: "品牌定位、传播体系与市场表达" },
  { id: "media-expert", name: "自媒体专家", description: "内容策划、账号运营与商业转化" },
  { id: "designer", name: "设计师", description: "品牌视觉、数字界面与创意表达" },
  { id: "software-engineering-advisor", name: "软件工程顾问", description: "技术架构、工程交付与研发治理" },
  { id: "ai-development-expert", name: "AI 开发专家", description: "模型应用、智能体与业务自动化" },
];

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
    serviceCategoryDescriptions: defaultServiceCategoryDescriptions,
    rangerIdentities: defaultRangerIdentities,
    rangers: rangerProfiles,
  });
}

export function nextRangerIdentityId(identities: RangerIdentity[]) {
  const occupied = new Set(identities.map((identity) => identity.id));
  let ordinal = identities.length + 1;
  while (occupied.has(`new-ranger-identity-${ordinal}`)) ordinal += 1;
  return `new-ranger-identity-${ordinal}`;
}

export function getOpcService(kind: OpcServiceKind, slug: string) {
  return allOpcServices.find((service) => service.kind === kind && service.slug === slug);
}

export function getRangerProfile(slug: string) {
  return rangerProfiles.find((profile) => profile.slug === slug);
}
