import "server-only";

import { getStoredContent } from "./content-store";
import { cleanEditorialTitle } from "./editorial-title";
import { admittedPublicRecords } from "./public-record-admission";
import type { ContentState, EventRecord, InformationItem } from "./types";

export type PublicContent = {
  events: EventRecord[];
  information: InformationItem[];
  state: ContentState;
};

function degradedContent(state?: ContentState): PublicContent {
  return {
    events: [],
    information: [],
    state: {
      mode: "degraded",
      updatedAt: state?.updatedAt ?? null,
      sourceCount: state?.sourceCount ?? 0,
      eventCount: 0,
      informationCount: 0,
      projectCount: state?.projectCount ?? 0,
      quarantinedCount: state?.quarantinedCount ?? 0,
      publicationVersion: state?.publicationVersion ?? 0,
    },
  };
}

function publicInformation(item: InformationItem): InformationItem {
  return {
    ...item,
    translatedTitle: cleanEditorialTitle(item.translatedTitle),
    originalTitle: cleanEditorialTitle(item.originalTitle),
  };
}

export async function getPublicContent(): Promise<PublicContent> {
  try {
    const stored = await getStoredContent();
    if (stored.state.mode === "live" || stored.state.mode === "degraded") {
      const age = stored.state.updatedAt ? Date.now() - Date.parse(stored.state.updatedAt) : Number.POSITIVE_INFINITY;
      const admittedRecords = admittedPublicRecords(stored.events, stored.information);
      const publicRecords = {
        ...admittedRecords,
        information: admittedRecords.information.map(publicInformation),
      };
      return {
        ...publicRecords,
        state: {
          ...stored.state,
          mode: age > 12 * 60 * 60 * 1000 ? "degraded" : stored.state.mode,
          eventCount: publicRecords.events.length,
          informationCount: publicRecords.information.length,
        },
      };
    }
    return degradedContent(stored.state);
  } catch {
    return degradedContent();
  }
}

/**
 * Shared list and event pages do not need entire article bodies. Keeping this
 * projection bounded prevents Next.js' 2 MB data-cache ceiling from turning a
 * large bootstrap corpus into a permanently stale cache entry.
 */
export async function getPublicContentIndex(): Promise<PublicContent> {
  const content = await getPublicContent();
  return {
    ...content,
    information: content.information.map((item) => ({
      ...item,
      translatedContent: item.translatedContent.slice(0, 320),
      originalContent: item.originalContent.slice(0, 320),
    })),
  };
}
