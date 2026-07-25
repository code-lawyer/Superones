export const CONTENT_GROUPS = [
  "information",
  "roadside",
  "podcasts",
  "papers",
  "documents",
  "courses",
] as const;

export const ITEM_KINDS = [
  "article",
  "personal_post",
  "community_topic",
  "podcast_episode",
  "paper",
  "release",
  "changelog",
] as const;

export const PROVENANCE_ROLES = ["canonical", "discovery"] as const;
export const PROVENANCE_STATUSES = ["verified", "declared", "unresolved"] as const;

export type ContentGroup = (typeof CONTENT_GROUPS)[number];
export type ItemKind = (typeof ITEM_KINDS)[number];
export type ProvenanceRole = (typeof PROVENANCE_ROLES)[number];
export type ProvenanceStatus = (typeof PROVENANCE_STATUSES)[number];

export type LegacyContentRouting = {
  contentGroup?: ContentGroup;
  sourceStream?: "information" | "roadside" | "statements";
  publisherKind?: string;
  itemKind?: ItemKind;
  channelType?: string;
};

/**
 * One deterministic routing interface for collectors, storage and presentation.
 * Transport protocols never decide where an item is published.
 */
export function resolveContentGroup(input: LegacyContentRouting): ContentGroup {
  if (input.contentGroup && CONTENT_GROUPS.includes(input.contentGroup)) return input.contentGroup;
  if (input.sourceStream === "roadside" || input.sourceStream === "statements") return "roadside";
  if (input.itemKind === "podcast_episode" || input.channelType === "podcast") return "podcasts";
  if (input.itemKind === "paper") return "papers";
  if (input.itemKind === "release" || input.itemKind === "changelog") return "documents";
  if (input.publisherKind === "organization" || input.publisherKind === "open_source_project") {
    return "documents";
  }
  if (
    input.publisherKind === "person"
    || input.publisherKind === "community"
    || input.publisherKind === "community_user"
  ) {
    return "roadside";
  }
  return "information";
}

export function legacySourceStream(group: ContentGroup) {
  return group === "roadside" ? "roadside" as const : "information" as const;
}

export function isEventInput(group: ContentGroup) {
  return group === "information" || group === "roadside" || group === "documents";
}

export function isRoadside(input: LegacyContentRouting) {
  return resolveContentGroup(input) === "roadside";
}
