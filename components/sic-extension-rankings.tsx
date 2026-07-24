"use client";

import type { KeyboardEvent } from "react";
import { useState } from "react";
import { formatNumber } from "@/lib/data";
import type {
  SicExtensionKind,
  SicExtensionMode,
  SicExtensionRankings,
} from "@/lib/sic-extensions";

type TabValue = SicExtensionKind | SicExtensionMode;

function handleTabKeys<T extends TabValue>(
  event: KeyboardEvent<HTMLDivElement>,
  values: readonly T[],
  current: T,
  select: (value: T) => void,
  id: (value: T) => string,
) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = values.indexOf(current);
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? values.length - 1
      : event.key === "ArrowRight"
        ? (currentIndex + 1) % values.length
        : (currentIndex - 1 + values.length) % values.length;
  const next = values[nextIndex];
  select(next);
  requestAnimationFrame(() => document.getElementById(id(next))?.focus());
}

export function SicExtensionRankings({ rankings }: { rankings: SicExtensionRankings }) {
  const [kind, setKind] = useState<SicExtensionKind>("skill");
  const [mode, setMode] = useState<SicExtensionMode>("selected");
  const [expanded, setExpanded] = useState(false);
  const group = kind === "skill" ? rankings.skills : rankings.mcps;
  const items = group[mode].slice(0, 20);
  const hasMore = items.length > 10;
  const metric = mode === "surging" ? "24H 新增" : kind === "skill" ? "采用量" : "调用量";
  const awaitingGrowth = mode === "surging" && !group.surgingReady;

  function selectKind(value: SicExtensionKind) {
    setKind(value);
    setExpanded(false);
  }

  function selectMode(value: SicExtensionMode) {
    setMode(value);
    setExpanded(false);
  }

  return (
    <section className="sic-extensions" aria-labelledby="sic-extensions-title">
      <header className="sic-extensions__header">
        <div className="sic-extensions__meta mono">
          <p className="eyebrow">EXTENSION ECOSYSTEM / 扩展生态</p>
          <span>TOP {expanded ? "20" : "10"}</span>
        </div>
        <h2 id="sic-extensions-title">优选 Skill 与 MCP</h2>
      </header>

      <div
        className="sic-extensions__tabs sic-extensions__tabs--kind"
        role="tablist"
        aria-label="扩展类型"
        onKeyDown={(event) => handleTabKeys(event, ["skill", "mcp"], kind, selectKind, (value) => `sic-extension-kind-${value}`)}
      >
        {(["skill", "mcp"] as const).map((value) => (
          <button
            id={`sic-extension-kind-${value}`}
            type="button"
            role="tab"
            aria-selected={kind === value}
            aria-controls="sic-extension-panel"
            tabIndex={kind === value ? 0 : -1}
            onClick={() => selectKind(value)}
            key={value}
          >
            {value.toUpperCase()}
          </button>
        ))}
      </div>

      <div
        className="sic-extensions__tabs sic-extensions__tabs--mode"
        role="tablist"
        aria-label="榜单类型"
        onKeyDown={(event) => handleTabKeys(event, ["selected", "surging"], mode, selectMode, (value) => `sic-extension-mode-${value}`)}
      >
        <button id="sic-extension-mode-selected" type="button" role="tab" aria-selected={mode === "selected"} aria-controls="sic-extension-panel" tabIndex={mode === "selected" ? 0 : -1} onClick={() => selectMode("selected")}>优选榜</button>
        <button id="sic-extension-mode-surging" type="button" role="tab" aria-selected={mode === "surging"} aria-controls="sic-extension-panel" tabIndex={mode === "surging" ? 0 : -1} onClick={() => selectMode("surging")}>飙升榜</button>
      </div>

      <div
        id="sic-extension-panel"
        className="sic-extensions__panel"
        role="tabpanel"
        aria-labelledby={`sic-extension-kind-${kind} sic-extension-mode-${mode}`}
        key={`${kind}-${mode}`}
      >
        <div className="sic-extensions__labels mono" aria-hidden="true">
          <span>{kind === "skill" ? "SKILL" : "MCP SERVER"}</span>
          <span>{metric}</span>
        </div>
        {items.length > 0 ? (
          <ol className="sic-extensions__list">
            {items.map((item, index) => {
              const visible = index < 10 || expanded;
              return (
              <li
                className={`${index >= 10 ? "sic-extensions__item--extra" : ""}${visible && index >= 10 ? " is-revealed" : ""}`}
                aria-hidden={!visible}
                key={item.id}
              >
                <a href={item.href} target="_blank" rel="noreferrer" tabIndex={visible ? 0 : -1}>
                  <span>{item.name}</span>
                  <strong className="mono">{formatNumber(item.value)}</strong>
                </a>
              </li>
              );
            })}
          </ol>
        ) : (
          <p className="sic-extensions__empty">
            {awaitingGrowth ? "正在积累首个 24 小时增量。" : "榜单数据正在接入。"}
          </p>
        )}
      </div>
      {hasMore ? (
        <button
          className="sic-extensions__toggle"
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? "收起至 Top 10" : "展开至 Top 20"}
        >
          <span className="sic-board__toggle-icon" aria-hidden="true" />
          <span className="sic-visually-hidden">{expanded ? "收起至 Top 10" : "展开至 Top 20"}</span>
        </button>
      ) : null}
    </section>
  );
}
