import { meetsEventThreshold } from "./content-compiler.ts";
import type { InformationItem } from "./types.ts";

export type AuditedEventCandidateGroup = {
  candidateKey: string;
  information: InformationItem[];
};

export type RejectedEventCandidateGroup = {
  candidateKey: string;
  reason: string;
};

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function clean(value: string, limit: number) {
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function auditEventCandidateGroups(
  value: unknown,
  information: InformationItem[],
) {
  const root = object(value);
  if (!root || !Array.isArray(root.groups)) {
    throw new Error("Event candidate audit must return a groups array.");
  }
  const eligible = new Map(information
    .filter((item) => item.contentGroup === "information" && item.eventSlugs.length === 0)
    .map((item) => [item.slug, item]));
  const claimed = new Set<string>();
  const accepted: AuditedEventCandidateGroup[] = [];
  const rejected: RejectedEventCandidateGroup[] = [];

  for (const raw of root.groups) {
    const group = object(raw);
    const candidateKey = typeof group?.candidateKey === "string"
      ? clean(group.candidateKey, 120)
      : "";
    if (!candidateKey || !Array.isArray(group?.informationSlugs)) {
      rejected.push({ candidateKey: candidateKey || "missing", reason: "invalid-shape" });
      continue;
    }
    const slugs = [...new Set(group.informationSlugs
      .filter((slug): slug is string => typeof slug === "string")
      .map((slug) => clean(slug, 180))
      .filter(Boolean))];
    if (slugs.some((slug) => claimed.has(slug))) {
      rejected.push({ candidateKey, reason: "overlapping-information" });
      continue;
    }
    const items = slugs.flatMap((slug) => {
      const item = eligible.get(slug);
      return item ? [item] : [];
    });
    if (items.length !== slugs.length) {
      rejected.push({ candidateKey, reason: "unknown-or-ineligible-information" });
      continue;
    }
    if (!meetsEventThreshold(items)) {
      rejected.push({ candidateKey, reason: "event-threshold-not-met" });
      continue;
    }
    for (const slug of slugs) claimed.add(slug);
    accepted.push({ candidateKey, information: items });
  }
  return { accepted, rejected };
}
