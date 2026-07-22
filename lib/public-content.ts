import "server-only";

import { events as demoEvents, projects as demoProjects, siteStatus } from "./data";
import { getStoredContent } from "./content-store";
import type { ContentState, EventRecord, TrendProject } from "./types";

export type PublicContent = {
  events: EventRecord[];
  projects: TrendProject[];
  state: ContentState;
};

export async function getPublicContent(): Promise<PublicContent> {
  try {
    const stored = await getStoredContent();
    if (stored.state.mode === "live") return stored;
  } catch {
    // A blank or malformed local store must never take down the public demo fallback.
  }
  return {
    events: demoEvents,
    projects: demoProjects,
    state: {
      mode: "demo",
      updatedAt: null,
      sourceCount: siteStatus.sources,
      eventCount: demoEvents.length,
      projectCount: demoProjects.length,
    },
  };
}
