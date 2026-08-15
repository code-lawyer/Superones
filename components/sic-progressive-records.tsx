"use client";

import { useState } from "react";
import { decodeHtmlEntities } from "@/lib/decode-html-entities";
import type { SicContentGroupId } from "@/lib/sic-content-types";
import type { SicPublicPage, SicPublicRecord } from "@/lib/sic-public-types";

function itemTitle(item: SicPublicRecord) {
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

function SicRecord({ item, index, compact = false }: {
  item: SicPublicRecord;
  index: number;
  compact?: boolean;
}) {
  return (
    <details className={`sic-overview-record${compact ? " sic-overview-record--compact" : ""}`}>
      <summary>
        <span className="sic-overview-record__index">{String(index + 1).padStart(2, "0")}</span>
        <span className="sic-overview-record__body">
          <span className="sic-overview-record__meta">
            <time dateTime={item.publishedAt ?? undefined}>{displayDate(item.publishedAt)}</time>
            <span>{item.sourceName}</span>
            {item.weeklyRank ? <span>周榜 {String(item.weeklyRank).padStart(2, "0")}</span> : null}
          </span>
          <strong>{itemTitle(item)}</strong>
          {item.translatedTitle && item.translatedTitle !== item.title ? <small lang="en">{decodeHtmlEntities(item.title)}</small> : null}
        </span>
        <span className="sic-overview-record__open" aria-hidden="true">↓</span>
      </summary>
      <div className="sic-overview-record__detail">
        <p>{item.summary}</p>
        {item.contentSummary ? <p className="sic-overview-content-summary">{item.contentSummary}</p> : null}
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
  group,
  initialItems,
  initialNextOffset,
  totalCount,
  snapshotId,
  label,
  compact = false,
  indexOffset = 0,
  countOffset = 0,
}: {
  group: SicContentGroupId;
  initialItems: SicPublicRecord[];
  initialNextOffset: number;
  totalCount: number;
  snapshotId: string;
  label: string;
  compact?: boolean;
  indexOffset?: number;
  countOffset?: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [nextOffset, setNextOffset] = useState(initialNextOffset);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const visibleCount = countOffset + items.length;

  async function loadMore() {
    setPending(true);
    setError("");
    try {
      const params = new URLSearchParams({
        group,
        offset: String(nextOffset),
        snapshot: snapshotId,
      });
      const response = await fetch(`/api/public/sic-content?${params.toString()}`, { cache: "no-store" });
      const body = await response.json().catch(() => null) as (Partial<SicPublicPage> & { error?: unknown; stale?: unknown }) | null;
      if (!response.ok) {
        setStale(response.status === 409 && body?.stale === true);
        throw new Error(typeof body?.error === "string" ? body.error : "更多内容暂时无法读取，请稍后重试。");
      }
      if (!body || !Array.isArray(body.items) || typeof body.nextOffset !== "number" || typeof body.totalCount !== "number") {
        throw new Error("更多内容返回格式无效，请稍后重试。");
      }
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...body.items!.filter((item) => !known.has(item.id))];
      });
      setNextOffset(body.nextOffset);
      setStale(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更多内容暂时无法读取，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {items.length ? (
        <div className="sic-overview-records">
          {items.map((item, index) => (
            <SicRecord item={item} index={index + indexOffset} compact={compact} key={item.id} />
          ))}
        </div>
      ) : null}
      {error ? <p className="sic-overview-more__error" role="alert">{error}</p> : null}
      {visibleCount < totalCount ? (
        <button
          className="sic-overview-more"
          type="button"
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={stale ? () => window.location.reload() : () => void loadMore()}
        >
          <span>{stale ? "刷新页面，读取最新内容" : pending ? `正在读取更多${label}` : `展开更多${label}`}</span>
          <span className="sic-overview-more__count" aria-live="polite">{visibleCount} / {totalCount}</span>
        </button>
      ) : null}
    </>
  );
}
