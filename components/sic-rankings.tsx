"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { formatNumber } from "@/lib/data";
import type { SicBoard } from "@/lib/sic";

type BoardCardProps = {
  board: SicBoard;
  className?: string;
  header?: ReactNode;
  tabPanel?: { id: string; labelledBy: string };
};

function BoardCard({ board, className = "", header, tabPanel }: BoardCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeItem, setActiveItem] = useState<string | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [copyFailedItem, setCopyFailedItem] = useState<string | null>(null);
  const displayItems = board.items.slice(0, 10);
  const hasMore = board.items.length > 5;

  async function copyAddress(itemId: string, address: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(address);
      setCopiedItem(itemId);
      setCopyFailedItem(null);
    } catch {
      const field = document.createElement("textarea");
      field.value = address;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      setCopiedItem(copied ? itemId : null);
      setCopyFailedItem(copied ? null : itemId);
    }
  }

  function showAddress(itemId: string, backId: string) {
    setActiveItem(itemId);
    setCopiedItem(null);
    setCopyFailedItem(null);
    requestAnimationFrame(() => document.getElementById(backId)?.focus());
  }

  function hideAddress(frontId: string) {
    setActiveItem(null);
    setCopiedItem(null);
    setCopyFailedItem(null);
    requestAnimationFrame(() => document.getElementById(frontId)?.focus());
  }

  return (
    <section className={`sic-board sic-board--${board.id}${className ? ` ${className}` : ""}`} aria-labelledby={`${board.id}-title`}>
      <header className="sic-board__header">
        <div className="sic-board__meta mono"><p className="sic-board__eyebrow">{board.eyebrow}</p><span>TOP {expanded ? "10" : "5"}</span></div>
        {header ?? <h2 id={`${board.id}-title`}>{board.title}</h2>}
        <p className="sic-board__description">{board.description}</p>
        {board.sourceUrl ? (
          <p className="sic-board__source mono">
            <a href={board.sourceUrl} target="_blank" rel="noreferrer">平台原始榜单</a>
            {board.capturedAt ? <time dateTime={board.capturedAt}>{new Date(board.capturedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</time> : null}
          </p>
        ) : null}
      </header>
      <div className="sic-board__labels mono" aria-hidden="true"><span>项目 / 模型</span><span>{board.metric}</span></div>
      <div {...(tabPanel ? { id: tabPanel.id, role: "tabpanel", "aria-labelledby": tabPanel.labelledBy } : {})}>
        {displayItems.length > 0 ? (
          <ol className="sic-board__list">
            {displayItems.map((item, index) => {
              const address = item.address ?? item.href ?? "";
              const active = activeItem === item.id;
              const visible = index < 5 || expanded;
              const identity = `${board.id}-${index}`;
              const frontId = `sic-board-front-${identity}`;
              const backId = `sic-board-back-${identity}`;
              return (
              <li key={item.id} className={`sic-board__row${index >= 5 ? " sic-board__row--extra" : ""}${visible && index >= 5 ? " is-revealed" : ""}${active ? " is-active" : ""}`} aria-hidden={!visible}>
                <div className="sic-board__flip">
                  <button id={frontId} className="sic-board__face sic-board__face--front" type="button" onClick={() => showAddress(item.id, backId)} aria-expanded={active} tabIndex={!visible || active ? -1 : 0}>
                    <span>{item.name}</span>
                    <strong className="mono">{item.value === null ? `#${String(index + 1).padStart(2, "0")}` : formatNumber(item.value)}</strong>
                  </button>
                  <div className="sic-board__face sic-board__face--back" aria-hidden={!active || !visible}>
                    <button id={backId} className="sic-board__address-return" type="button" onClick={() => hideAddress(frontId)} tabIndex={active && visible ? 0 : -1} title="返回项目名称">{address || "地址暂未提供"}</button>
                    {address ? <button className="sic-board__copy" type="button" onClick={() => void copyAddress(item.id, address)} tabIndex={active && visible ? 0 : -1} aria-live="polite">{copiedItem === item.id ? "已复制" : copyFailedItem === item.id ? "复制失败" : "复制"}</button> : null}
                  </div>
                </div>
              </li>
              );
            })}
          </ol>
        ) : <p className="sic-board__empty">{board.emptyMessage ?? "本期数据正在整理。"}</p>}
      </div>
      {hasMore ? (
        <button
          className="sic-board__toggle"
          type="button"
          onClick={() => { setExpanded((value) => !value); setActiveItem(null); setCopiedItem(null); setCopyFailedItem(null); }}
          aria-expanded={expanded}
          aria-label={expanded ? "收起至 Top 5" : "展开至 Top 10"}
        >
          <span className="sic-board__toggle-icon" aria-hidden="true" />
          <span className="sic-visually-hidden">{expanded ? "收起至 Top 5" : "展开至 Top 10"}</span>
        </button>
      ) : null}
    </section>
  );
}

export function SicRankings({
  boards,
}: {
  boards: SicBoard[];
}) {
  return (
    <div className="sic-ranking-rail" id="sic-rankings">
      <header className="sic-ranking-rail__header">
        <p className="eyebrow mono">LIVE INDEX / 实时坐标</p>
        <h2>趋势榜</h2>
      </header>
      <div className="sic-ranking-stack">
        {boards.map((board) => <BoardCard board={board} key={board.id} />)}
      </div>
    </div>
  );
}
