import "server-only";

import { events as demoEvents, informationItems as demoInformation, siteStatus } from "./data";
import { getStoredContent } from "./content-store";
import type { ContentState, EventRecord, InformationItem } from "./types";

export type PublicContent = {
  events: EventRecord[];
  information: InformationItem[];
  state: ContentState;
};

export async function getPublicContent(): Promise<PublicContent> {
  try {
    const stored = await getStoredContent();
    if (stored.state.mode === "live") {
      return { events: stored.events, information: stored.information, state: stored.state };
    }
  } catch {
    // A blank or malformed local store must never take down the public demo fallback.
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
