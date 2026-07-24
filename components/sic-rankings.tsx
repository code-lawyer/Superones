"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useState } from "react";
import { SicExtensionRankings as ExtensionRankings } from "@/components/sic-extension-rankings";
import { formatNumber } from "@/lib/data";
import type { SicExtensionRankings } from "@/lib/sic-extensions";
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

function GrowthBoard({ daily, weekly }: { daily: SicBoard; weekly: SicBoard }) {
  const [period, setPeriod] = useState<"24h" | "7d">("24h");
  const board = period === "24h" ? daily : weekly;
  const tabId = `sic-growth-tab-${period}`;

  function selectPeriod(next: "24h" | "7d", focus = false) {
    setPeriod(next);
    if (focus) requestAnimationFrame(() => document.getElementById(`sic-growth-tab-${next}`)?.focus());
  }

  function handleTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") selectPeriod("24h", true);
    else if (event.key === "End") selectPeriod("7d", true);
    else selectPeriod(period === "24h" ? "7d" : "24h", true);
  }

  return (
    <BoardCard
      board={board}
      className="sic-board--growth"
      key={period}
      tabPanel={{ id: "sic-growth-panel", labelledBy: tabId }}
      header={(
        <>
          <h2 id={`${board.id}-title`}>GitHub增长趋势</h2>
          <div className="sic-board__tabs" role="tablist" aria-label="GitHub 新增 Star 时间范围" onKeyDown={handleTabKey}>
            <button id="sic-growth-tab-24h" type="button" role="tab" aria-selected={period === "24h"} aria-controls="sic-growth-panel" tabIndex={period === "24h" ? 0 : -1} onClick={() => selectPeriod("24h")}>24Hours热点</button>
            <button id="sic-growth-tab-7d" type="button" role="tab" aria-selected={period === "7d"} aria-controls="sic-growth-panel" tabIndex={period === "7d" ? 0 : -1} onClick={() => selectPeriod("7d")}>7days趋势</button>
          </div>
        </>
      )}
    />
  );
}

export function SicRankings({
  githubBoards,
  modelBoards,
  extensionRankings,
}: {
  githubBoards: SicBoard[];
  modelBoards: SicBoard[];
  extensionRankings: SicExtensionRankings;
}) {
  const trending = githubBoards.find((board) => board.id === "github-trending");
  const daily = githubBoards.find((board) => board.id === "github-24h");
  const weekly = githubBoards.find((board) => board.id === "github-7d");
  return (
    <div className="sic-ranking-rail" id="sic-rankings">
      <header className="sic-ranking-rail__header">
        <p className="eyebrow mono">LIVE INDEX / 实时坐标</p>
        <h2>趋势榜</h2>
      </header>
      <div className="sic-ranking-stack">
        {trending ? <BoardCard board={trending} /> : null}
        {daily && weekly ? <GrowthBoard daily={daily} weekly={weekly} /> : null}
        {modelBoards.map((board) => <BoardCard board={board} key={board.id} />)}
      </div>
      <ExtensionRankings rankings={extensionRankings} />
    </div>
  );
}
