import { isPublicInformationAdmitted } from "./release-admission.ts";
import type { EventRecord, InformationItem } from "./types.ts";

export function admittedPublicRecords(events: EventRecord[], information: InformationItem[]) {
  const admittedInformation = information.filter(isPublicInformationAdmitted);
  const rejectedSlugs = new Set(
    information.filter((item) => !isPublicInformationAdmitted(item)).map((item) => item.slug),
  );
  const admittedEvents = events.filter((event) => !(event.sources ?? []).some(
    (source) => source.informationSlug && rejectedSlugs.has(source.informationSlug),
  ));
  const publicEventSlugs = new Set(admittedEvents.map((event) => event.slug));
  return {
    events: admittedEvents,
    information: admittedInformation.map((item) => {
      const eventSlugs = item.eventSlugs.filter((slug) => publicEventSlugs.has(slug));
      return {
        ...item,
        eventSlugs,
        primaryEventSlug: item.primaryEventSlug && publicEventSlugs.has(item.primaryEventSlug)
          ? item.primaryEventSlug
          : eventSlugs[0],
      };
    }),
  };
}
