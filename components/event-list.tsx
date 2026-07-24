import Link from "next/link";
import { beijingDate, eventJudgment } from "@/lib/feed-format";
import type { EventRecord } from "@/lib/types";

export function EventList({ items }: { items: EventRecord[] }) {
  const groups = new Map<string, EventRecord[]>();
  for (const item of items) {
    const date = beijingDate(item.updated);
    groups.set(date, [...(groups.get(date) ?? []), item]);
  }

  return (
    <div className="event-ledger">
      {[...groups.entries()].map(([date, events]) => (
        <section className="event-day" key={date} aria-labelledby={`date-${date}`}>
          <p className="event-day__date mono" id={`date-${date}`}>{date}</p>
          <div className="event-day__entries">
            {events.map((item) => (
              <article className="event-entry" key={item.slug}>
                <Link className="event-entry__link" href={`/feed/${item.slug}`}>
                  <h2><span>{item.title}</span></h2>
                  <p>{eventJudgment(item)}</p>
                </Link>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
