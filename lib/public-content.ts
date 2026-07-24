import "server-only";

import { events as demoEvents, informationItems as demoInformation, projects as demoProjects, siteStatus } from "./data";
import { getStoredContent } from "./content-store";
import type { ContentState, EventRecord, InformationItem, TrendProject } from "./types";

export type PublicContent = {
  events: EventRecord[];
  information: InformationItem[];
  projects: TrendProject[];
  state: ContentState;
};

export async function getPublicContent(): Promise<PublicContent> {
  try {
    const stored = await getStoredContent();
    if (stored.state.mode === "live") {
      return { events: stored.events, information: stored.information, projects: stored.projects, state: stored.state };
    }
  } catch {
    // A blank or malformed local store must never take down the public demo fallback.
  }
  return {
    events: demoEvents,
    information: demoInformation,
    projects: demoProjects,
    state: {
      mode: "demo",
      updatedAt: null,
      sourceCount: siteStatus.sources,
      eventCount: demoEvents.length,
      informationCount: demoInformation.length,
      projectCount: demoProjects.length,
      quarantinedCount: 0,
      publicationVersion: 0,
    },
  };
}
