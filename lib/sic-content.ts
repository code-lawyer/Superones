import "server-only";

import { getSicStoredContent } from "./sic-content-store.ts";
import { SIC_CONTENT_GROUP_IDS, type SicContentGroupId, type SicContentItem } from "./sic-content-types.ts";

export type SicContentByGroup = Record<SicContentGroupId, SicContentItem[]>;

function timestamp(item: SicContentItem) {
  const value = Date.parse(item.publishedAt ?? item.collectedAt);
  return Number.isNaN(value) ? 0 : value;
}

export function latestSicContentPerSource(items: SicContentItem[]) {
  const seen = new Set<string>();
  return [...items]
    .sort((left, right) => timestamp(right) - timestamp(left))
    .filter((item) => {
      if (seen.has(item.sourceId)) return false;
      seen.add(item.sourceId);
      return true;
    });
}

export async function getSicContent() {
  const stored = await getSicStoredContent();
  const groups: SicContentByGroup = { papers: [], archive: [], courses: [], podcasts: [] };
  const updatedAt = stored.state.updatedAt ? Date.parse(stored.state.updatedAt) : 0;
  if (!updatedAt || Date.now() - updatedAt > 36 * 60 * 60 * 1000) {
    return { groups, state: stored.state };
  }
  for (const item of stored.items) groups[item.group].push(item);
  for (const group of SIC_CONTENT_GROUP_IDS) groups[group] = latestSicContentPerSource(groups[group]);
  return { groups, state: stored.state };
}
