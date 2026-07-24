export type XSourcePolicyAccount = {
  handle: string;
  status: "active";
  authorityTier: "official_organization" | "official_project" | "editorial_voice" | "authoritative_person";
  publisherKind: "organization" | "open_source_project" | "editorial_media" | "person";
  evidenceNature: "primary" | "reported_analysis" | "social_community";
  confidence: "high";
};

export type XSourcePolicy = {
  version: 1;
  defaultStatus: "excluded";
  principles: string[];
  accounts: Map<string, XSourcePolicyAccount>;
  counts: Record<string, number>;
};

export function normalizeXHandle(value: unknown): string;
export function compileXSourcePolicy(value: unknown): XSourcePolicy;
export function loadXSourcePolicy(path: string): Promise<{
  policy: XSourcePolicy;
  hash: string;
  text: string;
}>;
