import { createHash } from "node:crypto";
import type { SicContentByGroup } from "./sic-content.ts";
import { SIC_CONTENT_GROUP_IDS, type SicContentGroupId, type SicContentItem } from "./sic-content-types.ts";
import type { SicPublicPage, SicPublicRecord } from "./sic-public-types.ts";

export function toSicPublicRecord(item: SicContentItem): SicPublicRecord {
  const summary = item.description ?? item.summary;
  return {
    id: item.id,
    sourceName: item.sourceName,
    title: item.title,
    ...(item.translatedTitle ? { translatedTitle: item.translatedTitle } : {}),
    summary,
    ...(item.contentSummary && item.contentSummary !== summary ? { contentSummary: item.contentSummary } : {}),
    url: item.url,
    publishedAt: item.publishedAt ?? item.collectedAt,
    ...(item.weeklyRank ? { weeklyRank: item.weeklyRank } : {}),
  };
}

export function sicPublicGroupSnapshotId(content: SicContentByGroup, group: SicContentGroupId) {
  const digest = createHash("sha256");
  digest.update(group);
  digest.update("\0");
  for (const item of content[group]) {
    digest.update(JSON.stringify(toSicPublicRecord(item)));
    digest.update("\0");
  }
  return digest.digest("hex").slice(0, 24);
}

export function sicPublicGroupSnapshotIds(content: SicContentByGroup) {
  return Object.fromEntries(SIC_CONTENT_GROUP_IDS.map((group) => [
    group,
    sicPublicGroupSnapshotId(content, group),
  ])) as Record<SicContentGroupId, string>;
}

export function sicPublicPage(
  content: SicContentByGroup,
  snapshotId: string,
  group: SicContentGroupId,
  offset: number,
  limit: number,
): SicPublicPage {
  const records = content[group];
  const start = Math.min(Math.max(0, Math.floor(offset)), records.length);
  const size = Math.min(Math.max(1, Math.floor(limit)), 10);
  const end = Math.min(start + size, records.length);
  return {
    group,
    items: records.slice(start, end).map(toSicPublicRecord),
    nextOffset: end,
    totalCount: records.length,
    snapshotId,
  };
}
