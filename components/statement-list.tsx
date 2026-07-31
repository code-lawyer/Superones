"use client";

import { useEffect, useRef, useState } from "react";
import { beijingTime } from "@/lib/feed-format";
import { cleanStatementText } from "@/lib/statement-text";
import type { InformationItem } from "@/lib/types";

function personName(item: InformationItem) {
  return item.sourceName;
}

function account(item: InformationItem) {
  if (item.publisherKind === "community_user" || item.publisherKind === "community") {
    return "未核验社区身份";
  }
  const value = item.originAccount?.replace(/^@/, "").trim();
  return value ? `@${value}` : "个人博客";
}

function statementText(item: InformationItem) {
  const cleaned = cleanStatementText(item.translatedContent || item.originalContent || item.summary);
  const limit = item.originPlatform === "x" ? 1_800 : 900;
  return cleaned.length > limit ? `${cleaned.slice(0, limit).trimEnd()}…` : cleaned;
}

export function RoadsideList({
  items,
  initialItem,
}: {
  items: InformationItem[];
  initialItem?: InformationItem;
}) {
  const [selected, setSelected] = useState<InformationItem | null>(initialItem ?? null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selected && !dialog.open) dialog.showModal();
    if (!selected && dialog.open) dialog.close();
  }, [selected]);

  return (
    <>
      <div className="statement-list">
        {items.map((item) => (
          <article className="statement-row" key={item.slug}>
            <button
              className="statement-row__link"
              type="button"
              onClick={() => setSelected(item)}
              aria-haspopup="dialog"
            >
              <header>
                <strong>{personName(item)}</strong>
                <span className="mono">{account(item)}</span>
                <time>{beijingTime(item.publishedAt)}</time>
              </header>
              <h3>{item.translatedTitle}</h3>
              <span className="statement-row__open mono">查看言论</span>
            </button>
          </article>
        ))}
      </div>

      <dialog
        className="roadside-dialog"
        ref={dialogRef}
        aria-labelledby="roadside-voice-name"
        onClose={() => setSelected(null)}
        onClick={(event) => {
          if (event.currentTarget === event.target) event.currentTarget.close();
        }}
      >
        {selected ? (
          <article className="roadside-voice">
            <header className="roadside-voice__identity">
              <span className="roadside-voice__mark" aria-hidden="true">
                {personName(selected).trim().slice(0, 1).toUpperCase()}
              </span>
              <div>
                <strong id="roadside-voice-name">{personName(selected)}</strong>
                <span className="mono">{account(selected)}</span>
              </div>
              <button
                className="roadside-voice__close mono"
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label="关闭言论"
              >
                关闭
              </button>
            </header>
            <p className="roadside-voice__statement">{statementText(selected)}</p>
            <footer className="roadside-voice__meta">
              <time>{beijingTime(selected.publishedAt, true)}</time>
              <a
                href={selected.originUrl ?? selected.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                {selected.originPlatform === "x" ? "查看原始 X" : "查看原始发布"}
              </a>
            </footer>
          </article>
        ) : null}
      </dialog>
    </>
  );
}
