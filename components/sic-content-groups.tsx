import type { SicContentByGroup } from "@/lib/sic-content";
import type { SicContentGroup } from "@/lib/sic";
import type { SicContentGroupId } from "@/lib/sic-content-types";
import { toSicPublicRecord } from "@/lib/sic-public-projection";
import { SicProgressiveRecords } from "./sic-progressive-records";

export function SicContentGroups({
  groups,
  content,
  snapshotIds,
}: {
  groups: SicContentGroup[];
  content: SicContentByGroup;
  snapshotIds: Record<SicContentGroupId, string>;
}) {
  return (
    <div className="sic-overview-grid">
      {groups.map((group) => {
        const items = content[group.id];
        return (
          <section className="sic-overview-group" id={`sic-group-${group.id}`} aria-labelledby={`sic-group-${group.id}-title`} key={group.id}>
            <header className="sic-overview-group__header">
              <span>SiC / {group.id.toUpperCase()}</span>
              <h2 id={`sic-group-${group.id}-title`}>{group.title}</h2>
              <p>{group.description}</p>
            </header>
            {items.length ? (
              <SicProgressiveRecords
                key={`${group.id}:${snapshotIds[group.id]}`}
                group={group.id as SicContentGroupId}
                initialItems={items.slice(0, 4).map(toSicPublicRecord)}
                initialNextOffset={Math.min(4, items.length)}
                totalCount={items.length}
                snapshotId={snapshotIds[group.id]}
                label={group.title}
                compact
              />
            ) : <p className="sic-overview-empty">{group.emptyMessage}</p>}
          </section>
        );
      })}
    </div>
  );
}
