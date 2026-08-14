"use client";

import { useState } from "react";
import type { SicContentByGroup } from "@/lib/sic-content";
import type { SicContentGroup } from "@/lib/sic";
import type { SicContentItem } from "@/lib/sic-content-types";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";

function itemTitle(item: SicContentItem) {
  return decodeHtmlEntities(item.translatedTitle ?? item.title);
}

function displayDate(value: string | null | undefined) {
  if (!value) return "近期";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "近期";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(parsed).replaceAll("/", ".");
}

export function SicRecord({ item, index, compact = false }: {
  item: SicContentItem;
  index: number;
  compact?: boolean;
}) {
  return (
    <details className={`sic-overview-record${compact ? " sic-overview-record--compact" : ""}`}>
      <summary>
        <span className="sic-overview-record__index">{String(index + 1).padStart(2, "0")}</span>
        <span className="sic-overview-record__body">
          <span className="sic-overview-record__meta">
            <time dateTime={item.publishedAt ?? item.collectedAt}>{displayDate(item.publishedAt ?? item.collectedAt)}</time>
            <span>{item.sourceName}</span>
            {item.weeklyRank ? <span>周榜 {String(item.weeklyRank).padStart(2, "0")}</span> : null}
          </span>
          <strong>{itemTitle(item)}</strong>
          {item.translatedTitle && item.translatedTitle !== item.title ? <small lang="en">{decodeHtmlEntities(item.title)}</small> : null}
        </span>
        <span className="sic-overview-record__open" aria-hidden="true">↓</span>
      </summary>
      <div className="sic-overview-record__detail">
        <p>{item.description ?? item.contentSummary ?? item.summary}</p>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${itemTitle(item)}原始来源（在新标签页打开）`}
        >查看原始来源 ↗</a>
      </div>
    </details>
  );
}

export function SicProgressiveRecords({
  items,
  initialCount,
  increment,
  label,
  compact = false,
  indexOffset = 0,
  countOffset = 0,
}: {
  items: SicContentItem[];
  initialCount: number;
  increment: number;
  label: string;
  compact?: boolean;
  indexOffset?: number;
  countOffset?: number;
}) {
  const [visibleCount, setVisibleCount] = useState(Math.min(initialCount, items.length));
  const visibleItems = items.slice(0, visibleCount);
  const totalCount = countOffset + items.length;

  return (
    <>
      {visibleItems.length ? (
        <div className="sic-overview-records">
          {visibleItems.map((item, index) => (
            <SicRecord item={item} index={index + indexOffset} compact={compact} key={item.id} />
          ))}
        </div>
      ) : null}
      {visibleCount < items.length ? (
        <button
          className="sic-overview-more"
          type="button"
          onClick={() => setVisibleCount((current) => Math.min(items.length, current + increment))}
        >
          <span>展开更多{label}</span>
          <span className="sic-overview-more__count" aria-live="polite">{countOffset + visibleCount} / {totalCount}</span>
        </button>
      ) : null}
    </>
  );
}

export function SicContentGroups({
  groups,
  content,
  unavailable = false,
  unavailableGroups = {},
}: {
  groups: SicContentGroup[];
  content: SicContentByGroup;
  unavailable?: boolean;
  unavailableGroups?: Partial<Record<SicContentGroup["id"], boolean>>;
}) {
  return (
    <div className="sic-overview-grid">
      {unavailable ? (
        <p className="sic-overview-status" role="status">固定来源读取失败；当前没有可安全展示的缓存，请稍后重试。</p>
      ) : null}
      {groups.map((group) => {
        const items = content[group.id];
        const groupUnavailable = unavailable || unavailableGroups[group.id];
        return (
          <section className="sic-overview-group" id={`sic-group-${group.id}`} aria-labelledby={`sic-group-${group.id}-title`} key={group.id}>
            <header className="sic-overview-group__header">
              <span>SiC / {group.id.toUpperCase()}</span>
              <h2 id={`sic-group-${group.id}-title`}>{group.title}</h2>
              <p>{group.description}</p>
              {groupUnavailable && items.length ? (
                <p className="sic-overview-group__status" role="status">部分内容暂时无法更新；当前展示可用快照。</p>
              ) : null}
            </header>
            {items.length ? (
              <SicProgressiveRecords items={items} initialCount={4} increment={5} label={group.title} compact />
            ) : <p className="sic-overview-empty">{groupUnavailable ? "读取失败 / 暂无可用缓存" : group.emptyMessage}</p>}
          </section>
        );
      })}
    </div>
  );
}
