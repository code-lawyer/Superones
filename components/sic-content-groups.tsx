import type { SicContentByGroup, SicDelayedSource } from "@/lib/sic-content";
import type { SicContentGroup } from "@/lib/sic";
import type { SicContentGroupId } from "@/lib/sic-content-types";
import { toSicPublicRecord } from "@/lib/sic-public-projection";
import { SicProgressiveRecords } from "./sic-progressive-records";

export function SicContentGroups({
  groups,
  content,
  unavailable = false,
  unavailableGroups = {},
  delayedSources = [],
  snapshotIds,
}: {
  groups: SicContentGroup[];
  content: SicContentByGroup;
  unavailable?: boolean;
  unavailableGroups?: Partial<Record<SicContentGroup["id"], boolean>>;
  delayedSources?: SicDelayedSource[];
  snapshotIds: Record<SicContentGroupId, string>;
}) {
  return (
    <div className="sic-overview-grid">
      {unavailable ? (
        <p className="sic-overview-status" role="status">固定来源读取失败；当前没有可安全展示的缓存，请稍后重试。</p>
      ) : null}
      {groups.map((group) => {
        const items = content[group.id];
        const groupUnavailable = unavailable || unavailableGroups[group.id];
        const groupDelayedSources = delayedSources.filter((source) => source.group === group.id);
        return (
          <section className="sic-overview-group" id={`sic-group-${group.id}`} aria-labelledby={`sic-group-${group.id}-title`} key={group.id}>
            <header className="sic-overview-group__header">
              <span>SiC / {group.id.toUpperCase()}</span>
              <h2 id={`sic-group-${group.id}-title`}>{group.title}</h2>
              <p>{group.description}</p>
              {groupUnavailable && items.length ? (
                <p className="sic-overview-group__status" role="status">部分内容暂时无法更新；当前展示可用快照。</p>
              ) : null}
              {groupDelayedSources.length ? (
                <p className="sic-overview-group__status" role="status">
                  更新延迟：{groupDelayedSources.map((source) => source.sourceName).join("、")}；当前展示上一成功快照。
                </p>
              ) : null}
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
            ) : <p className="sic-overview-empty">{groupUnavailable ? "读取失败 / 暂无可用缓存" : group.emptyMessage}</p>}
          </section>
        );
      })}
    </div>
  );
}
