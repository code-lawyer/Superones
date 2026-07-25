import "server-only";

import { events as demoEvents, informationItems as demoInformation, siteStatus } from "./data";
import { getStoredContent } from "./content-store";
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

export async function getPublicContent(): Promise<PublicContent> {
  try {
    const stored = await getStoredContent();
    if (stored.state.mode === "live") {
      return { events: stored.events, information: stored.information, state: stored.state };
    }
    if (process.env.NODE_ENV === "production") {
      return degradedContent(stored.state);
    }
  } catch {
    if (process.env.NODE_ENV === "production") {
      return degradedContent();
    }
  }
  return {
    events: demoEvents,
    information: demoInformation,
    state: {
      mode: "demo",
      updatedAt: null,
      sourceCount: siteStatus.sources,
      eventCount: demoEvents.length,
      informationCount: demoInformation.length,
      projectCount: 0,
      quarantinedCount: 0,
      publicationVersion: 0,
    },
  };
}
