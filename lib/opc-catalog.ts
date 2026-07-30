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
