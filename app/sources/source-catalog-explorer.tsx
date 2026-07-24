"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  SourceCatalog,
  SourceCatalogMethod,
  SourceCatalogSection,
  SourceCatalogSectionId,
} from "@/lib/source-catalog-types";
import styles from "./source-catalog.module.css";

function sourceCount(section: SourceCatalogSection) {
  return section.methods.reduce((total, method) => total + method.sources.length, 0);
}

function matches(source: SourceCatalogMethod["sources"][number], query: string) {
  if (!query) return true;
  const haystack = [
    source.name,
    source.publisher,
    source.channelLabel,
    source.destinationLabel,
    source.sourceUrl,
    source.endpointUrl,
    source.purpose,
    source.nature,
    source.evidenceLabel,
    source.provenance,
  ].join(" ").toLocaleLowerCase("zh-CN");
  return haystack.includes(query.toLocaleLowerCase("zh-CN"));
}

function filterSection(section: SourceCatalogSection, query: string) {
  return {
    ...section,
    methods: section.methods
      .map((method) => ({ ...method, sources: method.sources.filter((source) => matches(source, query)) }))
      .filter((method) => method.sources.length > 0),
  };
}

function MethodTable({ method, sectionId }: { method: SourceCatalogMethod; sectionId: SourceCatalogSectionId }) {
  return (
    <div className={styles.methodTable} role="table" aria-label={`${method.label} 来源`}>
      <div className={styles.tableHead} role="row">
        <span role="columnheader">来源</span>
        <span role="columnheader">体现位置</span>
        <span role="columnheader">性质</span>
        <span role="columnheader">主要作用</span>
        <span role="columnheader">原始源 / 抓取端点</span>
      </div>
      {method.sources.map((source) => (
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
          <div role="cell">
            <span className={`${styles.cellLabel} mono`}>主要作用</span>
            <p className={styles.purpose}>{source.purpose}</p>
          </div>
          <div className={styles.sourceLinks} role="cell">
            <span className={`${styles.cellLabel} mono`}>原始源</span>
            <a href={source.sourceUrl} target="_blank" rel="noreferrer" title={source.sourceUrl}>
              {source.sourceUrl} ↗
            </a>
            {source.endpointUrl !== source.sourceUrl ? (
              <a className={styles.endpoint} href={source.endpointUrl} target="_blank" rel="noreferrer" title={source.endpointUrl}>
                抓取：{source.endpointUrl} ↗
              </a>
            ) : null}
            <p className={styles.provenance}>{source.provenance}</p>
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
  const [openMethods, setOpenMethods] = useState<Set<string>>(new Set());

  const visibleSections = useMemo(() => catalog.sections
    .filter((section) => selectedSection === "all" || section.id === selectedSection)
    .map((section) => filterSection(section, query.trim()))
    .filter((section) => section.methods.length > 0), [catalog.sections, query, selectedSection]);
  const visibleCount = visibleSections.reduce(
    (total, section) => total + section.methods.reduce((count, method) => count + method.sources.length, 0),
    0,
  );
  const searching = query.trim().length > 0;
  const allExpanded = catalog.sections.every((section) => openSections.has(section.id))
    && catalog.sections.every((section) => section.methods.every((method) => openMethods.has(`${section.id}:${method.id}`)));

  function toggleSection(sectionId: string) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  function toggleMethod(key: string) {
    setOpenMethods((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
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
      setOpenMethods(new Set());
      return;
    }
    setOpenSections(new Set(catalog.sections.map((section) => section.id)));
    setOpenMethods(new Set(catalog.sections.flatMap((section) => section.methods.map((method) => `${section.id}:${method.id}`))));
  }

  return (
    <main className={styles.page}>
      <header className={`${styles.hero} shell`}>
        <div className={styles.heroGrid}>
          <div>
            <p className="eyebrow mono">SOURCE ATLAS / 采集航图</p>
            <h1>数据从哪里来，最后流向哪里</h1>
            <p className={styles.heroLead}>
              这里列出统一采集管线实际尝试的全部来源。先按产品板块分区，再按 RSS、API、页面索引等采集方式折叠；每一行都说明来源性质、用途和最终展示位置。
            </p>
          </div>
          <aside className={styles.heroAside} aria-label="来源清单概览">
            <div><span className="mono">REGISTERED</span><strong>{catalog.total}</strong></div>
            <div><span className="mono">SECTIONS</span><strong>{catalog.sections.length}</strong></div>
            <div><span className="mono">REVISION</span><strong className="mono">{catalog.registryRevision.replace("source-bundle-", "").slice(0, 8)}</strong></div>
          </aside>
        </div>
      </header>

      <section className={styles.routes} aria-label="按产品板块查看">
        {catalog.sections.map((section) => (
          <button
            className={`${styles.route} ${selectedSection === section.id ? styles.routeActive : ""}`}
            data-section={section.id}
            key={section.id}
            type="button"
            onClick={() => showSection(section.id)}
          >
            <span className={`${styles.routeCode} mono`}>{section.code}</span>
            <div className={styles.routeMain}>
              <h2>{section.label}</h2>
              <span className={`${styles.routeCount} mono`}>{sourceCount(section)}</span>
            </div>
            <p>{section.description}</p>
          </button>
        ))}
      </section>

      <div className={`${styles.toolbar} shell`} id="source-catalog">
        <div className={styles.searchWrap}>
          <label className="skip-link" htmlFor="source-search">搜索来源</label>
          <input
            className={styles.search}
            id="source-search"
            type="search"
            value={query}
            placeholder="搜索名称、发布方、URL、用途或性质"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? <button className={styles.clearSearch} type="button" onClick={() => setQuery("")}>清除</button> : null}
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
          const total = section.methods.reduce((count, method) => count + method.sources.length, 0);
          return (
            <section className={styles.section} data-section={section.id} key={section.id}>
              <button
                className={styles.sectionToggle}
                type="button"
                aria-expanded={isSectionOpen}
                aria-controls={`source-section-${section.id}`}
                onClick={() => toggleSection(section.id)}
              >
                <span className={`${styles.sectionCode} mono`}>{section.code}</span>
                <h2>{section.label}</h2>
                <p>{section.description}</p>
                <strong className={`${styles.sectionTotal} mono`}>{total}</strong>
                <span className={`${styles.chevron} ${isSectionOpen ? styles.chevronOpen : ""}`} aria-hidden="true">＋</span>
              </button>
              {isSectionOpen ? (
                <div className={styles.sectionBody} id={`source-section-${section.id}`}>
                  {section.methods.map((method) => {
                    const methodKey = `${section.id}:${method.id}`;
                    const isMethodOpen = searching || openMethods.has(methodKey);
                    return (
                      <section className={styles.method} key={methodKey}>
                        <button
                          className={styles.methodToggle}
                          type="button"
                          aria-expanded={isMethodOpen}
                          aria-controls={`source-method-${methodKey}`}
                          onClick={() => toggleMethod(methodKey)}
                        >
                          <strong>{method.label}</strong>
                          <p>{method.description}</p>
                          <span className={`${styles.methodCount} mono`}>{method.sources.length} SOURCES</span>
                          <span className={`${styles.chevron} ${isMethodOpen ? styles.chevronOpen : ""}`} aria-hidden="true">＋</span>
                        </button>
                        {isMethodOpen ? (
                          <div id={`source-method-${methodKey}`}>
                            <MethodTable method={method} sectionId={section.id} />
                          </div>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </section>
    </main>
  );
}
