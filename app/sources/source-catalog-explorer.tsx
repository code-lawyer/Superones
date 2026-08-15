"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type {
  SourceCatalog,
  SourceCatalogItem,
  SourceCatalogSection,
  SourceCatalogSectionId,
} from "@/lib/source-catalog-types";
import styles from "./source-catalog.module.css";

function sourceCount(section: SourceCatalogSection) {
  return section.sources.length;
}

function matches(source: SourceCatalogItem, query: string) {
  if (!query) return true;
  const haystack = [
    source.name,
    source.publisher,
    source.channelLabel,
    source.destinationLabel,
    source.sourceUrl,
    source.nature,
    source.evidenceLabel,
  ].join(" ").toLocaleLowerCase("zh-CN");
  return haystack.includes(query.toLocaleLowerCase("zh-CN"));
}

function filterSection(section: SourceCatalogSection, query: string) {
  return {
    ...section,
    sources: section.sources.filter((source) => matches(source, query)),
  };
}

function SourceTable({ sources, sectionId, label }: { sources: SourceCatalogItem[]; sectionId: SourceCatalogSectionId; label: string }) {
  return (
    <div className={styles.methodTable} role="table" aria-label={`${label} 来源`}>
      <div className={styles.tableHead} role="row">
        <span role="columnheader">来源</span>
        <span role="columnheader">体现位置</span>
        <span role="columnheader">性质</span>
        <span role="columnheader">原始来源</span>
      </div>
      {sources.map((source) => (
        <article className={styles.sourceRow} data-section={sectionId} role="row" key={source.id}>
          <div className={styles.sourceName} role="cell">
            <strong>{source.name}</strong>
            <span className="mono">{source.publisher} · {source.id}</span>
            <span className={`${styles.channel} mono`}>{source.channelLabel}</span>
          </div>
          <div role="cell">
            <span className={`${styles.cellLabel} mono`}>体现位置</span>
            <Link className={styles.destination} href={source.destinationHref}>{source.destinationLabel}</Link>
          </div>
          <div role="cell">
            <span className={`${styles.cellLabel} mono`}>来源性质</span>
            <div className={styles.nature}>{source.nature}</div>
            <div className={styles.evidence}>{source.evidenceLabel}</div>
          </div>
          <div className={styles.sourceLinks} role="cell">
            <span className={`${styles.cellLabel} mono`}>原始源</span>
            <a href={source.sourceUrl} target="_blank" rel="noreferrer" title={source.sourceUrl}>
              {source.sourceUrl} ↗
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}

export function SourceCatalogExplorer({ catalog }: { catalog: SourceCatalog }) {
  const [query, setQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<SourceCatalogSectionId | "all">("all");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  const visibleSections = useMemo(() => catalog.sections
    .filter((section) => selectedSection === "all" || section.id === selectedSection)
    .map((section) => filterSection(section, query.trim()))
    .filter((section) => section.sources.length > 0), [catalog.sections, query, selectedSection]);
  const visibleCount = visibleSections.reduce(
    (total, section) => total + section.sources.length,
    0,
  );
  const searching = query.trim().length > 0;
  const allExpanded = catalog.sections.every((section) => openSections.has(section.id));

  function toggleSection(sectionId: string) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  function showSection(sectionId: SourceCatalogSectionId) {
    setSelectedSection(sectionId);
    setOpenSections((current) => new Set(current).add(sectionId));
    document.getElementById("source-catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleAll() {
    if (allExpanded) {
      setOpenSections(new Set());
      return;
    }
    setOpenSections(new Set(catalog.sections.map((section) => section.id)));
  }

  function clearSearch() {
    setQuery("");
    searchInputRef.current?.focus();
  }

  return (
    <section className={styles.page} aria-label="数据源地图">
      <header className={`${styles.hero} shell`}>
        <div className={styles.heroGrid}>
          <div>
            <p className="eyebrow mono">SOURCE ATLAS / 采集航图</p>
            <h1>数据从哪里来，最后流向哪里</h1>
            <p className={styles.heroLead}>
              这里列出当前进入公开内容的根源身份。资讯瀑布只收新闻型内容，路边社承载人物公开表达，SiC 档案只收深度研究和技术材料；同一原始内容只有一个主去向。每一行只说明发布者、内容性质、产品去向和公开原链接。
            </p>
          </div>
          <aside className={styles.heroAside} aria-label="来源清单概览">
            <div><span className="mono">REGISTERED</span><strong>{catalog.total}</strong></div>
            <div><span className="mono">STREAMS</span><strong>{catalog.sections.length}</strong></div>
          </aside>
        </div>
      </header>

      <section className={styles.routes} aria-label="按产品板块查看">
        {catalog.sections.map((section) => {
          const titleId = `source-route-${section.id}-title`;
          return <article
            className={`${styles.route} ${selectedSection === section.id ? styles.routeActive : ""}`}
            data-section={section.id}
            key={section.id}
          >
            <span className={`${styles.routeCode} mono`}>{section.code}</span>
            <div className={styles.routeMain}>
              <h2 id={titleId}>{section.label}</h2>
              <span className={`${styles.routeCount} mono`}>{sourceCount(section)}</span>
            </div>
            <p>{section.description}</p>
            <button
              className={styles.routeAction}
              type="button"
              aria-label={`查看${section.label}来源`}
              aria-pressed={selectedSection === section.id}
              onClick={() => showSection(section.id)}
            />
          </article>;
        })}
      </section>

      <div className={`${styles.toolbar} shell`} id="source-catalog">
        <div className={styles.searchWrap}>
          <label className="skip-link" htmlFor="source-search">搜索来源</label>
          <input
            className={styles.search}
            id="source-search"
            ref={searchInputRef}
            type="search"
            value={query}
            placeholder="搜索名称、发布方、URL 或性质"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? <button className={styles.clearSearch} type="button" onClick={clearSearch}>清除</button> : null}
        </div>
        <span className={`${styles.resultCount} mono`}>{visibleCount} / {catalog.total} SOURCES</span>
        <button className={styles.expandButton} type="button" onClick={toggleAll}>
          {allExpanded ? "全部折叠" : "全部展开"}
        </button>
      </div>

      <section className={`${styles.catalog} shell`} aria-live="polite">
        {selectedSection !== "all" ? (
          <button className={styles.expandButton} type="button" onClick={() => setSelectedSection("all")}>
            显示全部板块
          </button>
        ) : null}
        {visibleSections.length === 0 ? (
          <p className={styles.empty}>没有匹配的来源。可以尝试发布方名称、平台名称或 URL。</p>
        ) : visibleSections.map((section) => {
          const isSectionOpen = searching || openSections.has(section.id);
          const total = section.sources.length;
          return (
            <section className={styles.section} data-section={section.id} aria-labelledby={`source-section-${section.id}-title`} key={section.id}>
              <header className={styles.sectionToggle}>
                <span className={`${styles.sectionCode} mono`}>{section.code}</span>
                <h2 id={`source-section-${section.id}-title`}>{section.label}</h2>
                <p>{section.description}</p>
                <strong className={`${styles.sectionTotal} mono`}>{total}</strong>
                <span className={`${styles.chevron} ${isSectionOpen ? styles.chevronOpen : ""}`} aria-hidden="true">＋</span>
                <button
                  className={styles.sectionToggleAction}
                  type="button"
                  aria-expanded={isSectionOpen}
                  aria-controls={`source-section-${section.id}`}
                  aria-label={`${isSectionOpen ? "折叠" : "展开"}${section.label}来源`}
                  onClick={() => toggleSection(section.id)}
                />
              </header>
              {isSectionOpen ? (
                <div className={styles.sectionBody} id={`source-section-${section.id}`}>
                  <SourceTable sources={section.sources} sectionId={section.id} label={section.label} />
                </div>
              ) : null}
            </section>
          );
        })}
      </section>
    </section>
  );
}
