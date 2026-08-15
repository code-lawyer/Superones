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
  rangerIdentities: RangerIdentity[];
  rangers: RangerProfile[];
};

export const RANGER_SIGNATURE_MAX_LENGTH = 120;

export const defaultRangerIdentities: RangerIdentity[] = [
  { id: "legal-advisor", name: "法律顾问" },
  { id: "finance-tax-advisor", name: "财税顾问" },
  { id: "intellectual-property-advisor", name: "知识产权顾问" },
  { id: "startup-advisor", name: "创业顾问" },
  { id: "product-advisor", name: "产品顾问" },
  { id: "brand-advisor", name: "品牌顾问" },
  { id: "media-expert", name: "自媒体专家" },
  { id: "designer", name: "设计师" },
  { id: "software-engineering-advisor", name: "软件工程顾问" },
  { id: "ai-development-expert", name: "AI 开发专家" },
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
