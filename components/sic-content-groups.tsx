"use client";

import { useState } from "react";
import type { SicContentByGroup } from "@/lib/sic-content";
import type { SicContentGroup } from "@/lib/sic";
import type { SicContentItem } from "@/lib/sic-content-types";

function displayDate(item: SicContentItem) {
  const date = item.publishedAt ?? item.collectedAt;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "近期";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).formatToParts(parsed);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}.${value("month")}.${value("day")}`;
}

export function SicContentGroups({ groups, content }: { groups: SicContentGroup[]; content: SicContentByGroup }) {
  const [activeItem, setActiveItem] = useState<string | null>(null);
  return (
    <section className="sic-magazine" aria-label="固定来源阅读">
      {groups.map((group, groupIndex) => {
        const items = content[group.id].slice(0, 6);
        return (
          <section className={`sic-magazine__section sic-magazine__section--${group.id}`} key={group.id} aria-labelledby={`sic-group-${group.id}`}>
            <header className="sic-magazine__header">
              <div className="sic-magazine__folio mono">
                <p>SIC / {group.id.toUpperCase()}</p>
                <span>{String(groupIndex + 1).padStart(2, "0")} / {String(groups.length).padStart(2, "0")}</span>
              </div>
              <h2 id={`sic-group-${group.id}`}>{group.title}</h2>
            </header>
            {items.length > 0 ? (
              <ol className="sic-magazine__list">
                {items.map((item) => {
                  const open = activeItem === item.id;
                  const detailId = `sic-content-${item.id}`;
                  const hasTranslation = Boolean(item.translatedTitle && item.translatedTitle !== item.title);
                  return (
                    <li className={`sic-magazine__entry${open ? " is-open" : ""}`} key={item.id}>
                      <article className="sic-magazine__surface">
                        <button className="sic-magazine__trigger" type="button" aria-expanded={open} aria-controls={detailId} onClick={() => setActiveItem(open ? null : item.id)}>
                          <span className="sic-magazine__meta mono">
                            <time dateTime={item.publishedAt ?? item.collectedAt}>{displayDate(item)}</time>
                            <span>{item.sourceName}</span>
                          </span>
                          <h3 className={hasTranslation ? "" : "sic-magazine__fallback-title"} lang={hasTranslation ? "zh-CN" : "en"}><span>{item.translatedTitle ?? item.title}</span></h3>
                          {hasTranslation ? <p className="sic-magazine__original" lang="en">{item.title}</p> : null}
                        </button>
                        <div className="sic-magazine__detail" id={detailId} aria-hidden={!open}>
                          <div className="sic-magazine__detail-inner">
                            <div className="sic-magazine__detail-copy">
                              <section>
                                <p className="mono">一句话说明</p>
                                <p>{item.description ?? item.summary}</p>
                              </section>
                              <section>
                                <p className="mono">内容摘要</p>
                                <p>{item.contentSummary ?? item.summary}</p>
                              </section>
                            </div>
                            <a className="sic-magazine__source-link" href={item.url} target="_blank" rel="noreferrer" tabIndex={open ? 0 : -1}>
                              <span>直达原文</span>
                              <span className="mono" aria-hidden="true">OPEN ↗</span>
                            </a>
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="sic-magazine__empty mono">{group.emptyMessage}</p>}
          </section>
        );
      })}
    </section>
  );
}
