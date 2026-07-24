import type { Metadata } from "next";
import Link from "next/link";
import {
  PIPELINE_SECTIONS,
  getPipelineRunSnapshot,
  type PipelineSection,
  type PipelineSourceHealth,
  type PipelineSourceStatus,
} from "@/lib/pipeline-run";
import styles from "./pipeline.module.css";

export const metadata: Metadata = {
  title: "信息管线实况 — Vault2077",
  description: "查看境外抓取、境内接收、模型处理与最终发布的真实试运行结果。",
};
export const dynamic = "force-dynamic";

const sectionLabels: Record<PipelineSection, { code: string; title: string }> = {
  information: { code: "INTEL", title: "资讯瀑布" },
  statements: { code: "VOICE", title: "名人说 / X 动态" },
  sic: { code: "SIC", title: "SiC 固定内容源" },
  rankings: { code: "SIGNAL", title: "榜单与生态信号" },
};

const statusLabels: Record<PipelineSourceStatus, string> = {
  succeeded: "成功",
  partial: "部分成功",
  empty: "本轮无新内容",
  failed: "失败",
};

function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function duration(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (value < 1_000) return `${value} ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(1)} s`;
  return `${(value / 60_000).toFixed(1)} min`;
}

function counts(items: PipelineSourceHealth[]) {
  return {
    succeeded: items.filter((item) => item.status === "succeeded").length,
    partial: items.filter((item) => item.status === "partial").length,
    empty: items.filter((item) => item.status === "empty").length,
    failed: items.filter((item) => item.status === "failed").length,
  };
}

function HealthLedger({
  section,
  items,
}: {
  section: PipelineSection;
  items: PipelineSourceHealth[];
}) {
  const summary = counts(items);
  const definition = sectionLabels[section];
  return (
    <details className={styles.healthGroup} open={summary.failed > 0}>
      <summary>
        <span className={styles.healthCode}>{definition.code}</span>
        <strong>{definition.title}</strong>
        <span>{items.length} 个来源</span>
        <span className={styles.healthSummary}>
          <i data-status="succeeded">{summary.succeeded}</i>
          <i data-status="empty">{summary.empty}</i>
          <i data-status="failed">{summary.failed}</i>
        </span>
      </summary>
      <div className={styles.healthTableWrap}>
        <table className={styles.healthTable}>
          <thead>
            <tr>
              <th>来源</th>
              <th>状态</th>
              <th>记录</th>
              <th>耗时</th>
              <th>适配器 / 故障</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sourceId}>
                <td>
                  <strong>{item.name}</strong>
                  <span>{item.sourceId}</span>
                </td>
                <td>
                  <span className={styles.status} data-status={item.status}>
                    {statusLabels[item.status]}
                  </span>
                </td>
                <td>{item.recordCount}</td>
                <td>{duration(item.durationMs)}</td>
                <td>
                  <span>{item.connector}</span>
                  {item.errorMessage ? <small>{item.errorMessage}</small> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default async function PipelinePage() {
  const snapshot = await getPipelineRunSnapshot();
  const report = snapshot.report;
  if (!snapshot.available || !report) {
    return (
      <main className={styles.page}>
        <header className={styles.empty}>
          <p className={styles.kicker}>PIPELINE LIVE / 本地实况</p>
          <h1>还没有可展示的真实试运行</h1>
          <p>完成一次全量本地管线运行后，这里会显示逐源健康度、境内模型结果和最终发布内容。</p>
          <Link href="/sources">先查看来源地图</Link>
        </header>
      </main>
    );
  }

  const completedProcessing = snapshot.queue.succeeded;
  const failedProcessing = snapshot.queue.failed;
  const visibleContent = snapshot.information.length
    + snapshot.statements.length
    + snapshot.sicItems.length
    + snapshot.events.length;
  const stages = [
    {
      code: "01 / OVERSEAS",
      title: "境外抓取",
      value: `${report.sources} 源 / ${report.records} 条`,
      ok: report.sourceStatus.failed === 0,
    },
    {
      code: "02 / TRANSFER",
      title: "签名投递",
      value: `${report.receipts.length} / ${report.batches} 批`,
      ok: report.receipts.length === report.batches,
    },
    {
      code: "03 / DOMESTIC",
      title: "境内接收",
      value: snapshot.retryAttempts > 0
        ? `${completedProcessing} 批完成 / ${snapshot.retryAttempts} 次重试`
        : `${completedProcessing} 批已处理`,
      ok: failedProcessing === 0
        && snapshot.queue.pending === 0
        && snapshot.queue.processing === 0
        && completedProcessing > 0,
    },
    {
      code: "04 / LLM",
      title: "模型处理",
      value: report.processor.model ?? "未配置",
      ok: Boolean(report.processor.model) && failedProcessing === 0,
    },
    {
      code: "05 / PUBLISH",
      title: "本地呈现",
      value: `${visibleContent} 条可见结果`,
      ok: visibleContent > 0,
    },
  ];

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroMeta}>
          <p className={styles.kicker}>PIPELINE LIVE / 境外 → 境内</p>
          <nav aria-label="管线页面导航">
            <Link href="/sources">来源地图</Link>
            <Link href="/feed">最终信息流</Link>
            <Link href="/sic">SiC 学院</Link>
          </nav>
        </div>
        <h1>这一次，数据真的跑完了</h1>
        <div className={styles.heroCopy}>
          <p>
            这里不是示例清单，而是同一轮真实抓取留下的运行账本：每个来源是否响应、传输了多少记录、
            境内模型处理了什么，以及哪些内容最终可见。
          </p>
          <dl>
            <div><dt>运行编号</dt><dd>{report.runId}</dd></div>
            <div><dt>采集截止</dt><dd>{dateTime(report.collectedAt)}（北京时间）</dd></div>
            <div><dt>观察窗口</dt><dd>{report.collectionLimits.lookbackHours} 小时</dd></div>
            <div><dt>单源上限</dt><dd>{report.collectionLimits.maxItemsPerSource} 条</dd></div>
          </dl>
        </div>
      </header>

      <section className={styles.trace} aria-label="信息管线五个检查点">
        {stages.map((stage) => (
          <article key={stage.code} data-ok={stage.ok}>
            <p>{stage.code}</p>
            <h2>{stage.title}</h2>
            <strong>{stage.value}</strong>
          </article>
        ))}
      </section>

      <section className={styles.metrics} aria-label="本轮关键指标">
        <article>
          <span>REGISTERED SOURCES</span>
          <strong>{report.sources}</strong>
          <p>本轮逐一尝试的正式来源</p>
        </article>
        <article>
          <span>SOURCE HEALTH</span>
          <strong>{report.sourceStatus.succeeded + report.sourceStatus.partial}</strong>
          <p>{report.sourceStatus.empty} 个无新内容，{report.sourceStatus.failed} 个失败</p>
        </article>
        <article>
          <span>RAW RECORDS</span>
          <strong>{report.records}</strong>
          <p>境外生成并签名传输的记录</p>
        </article>
        <article>
          <span>MODEL TIME</span>
          <strong>{duration(report.processor.durationMs)}</strong>
          <p>{report.processor.provider} / {report.processor.model}</p>
        </article>
        <article>
          <span>QUARANTINE</span>
          <strong>{snapshot.quarantineCount}</strong>
          <p>处理失败但未静默丢失的内容</p>
        </article>
      </section>

      <section className={styles.results} aria-labelledby="results-title">
        <header className={styles.sectionHeader}>
          <p>PROCESSED OUTPUT / 处理后内容</p>
          <h2 id="results-title">看看模型最终交付了什么</h2>
          <span>只展示最新样本；原文与来源身份仍然保留。</span>
        </header>
        <div className={styles.resultColumns}>
          <section className={styles.resultColumn}>
            <header>
              <p>INTEL / DOCUMENTS</p>
              <h3>资讯瀑布</h3>
              <strong>{snapshot.information.length}</strong>
            </header>
            {snapshot.information.slice(0, 6).map((item) => (
              <article key={item.slug}>
                <Link href={`/feed/info/${item.slug}`}>{item.translatedTitle}</Link>
                <p lang={item.originalLanguage}>{item.originalTitle}</p>
                <span>{item.sourceName} · {dateTime(item.publishedAt ?? item.discoveredAt)}</span>
              </article>
            ))}
            {snapshot.information.length === 0 ? <p className={styles.noResult}>本轮没有可见资讯。</p> : null}
          </section>

          <section className={styles.resultColumn} data-stream="statements">
            <header>
              <p>VOICE / X</p>
              <h3>名人说</h3>
              <strong>{snapshot.statements.length}</strong>
            </header>
            {snapshot.statements.slice(0, 6).map((item) => (
              <article key={item.slug}>
                <Link href={`/feed/info/${item.slug}`}>{item.translatedTitle}</Link>
                <p lang={item.originalLanguage}>{item.originalTitle}</p>
                <span>@{item.originAccount ?? item.author} · {dateTime(item.publishedAt ?? item.discoveredAt)}</span>
              </article>
            ))}
            {snapshot.statements.length === 0 ? <p className={styles.noResult}>本轮没有可见 X 动态。</p> : null}
          </section>

          <section className={styles.resultColumn} data-stream="sic">
            <header>
              <p>LIBRARY / SIC</p>
              <h3>学院内容</h3>
              <strong>{snapshot.sicItems.length}</strong>
            </header>
            {snapshot.sicItems.slice(0, 6).map((item) => (
              <article key={item.id}>
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.translatedTitle ?? item.title}
                </a>
                <p>{item.contentSummary ?? item.description ?? item.summary}</p>
                <span>{item.sourceName} · {dateTime(item.publishedAt ?? item.collectedAt)}</span>
              </article>
            ))}
            {snapshot.sicItems.length === 0 ? <p className={styles.noResult}>本轮没有可见 SiC 内容。</p> : null}
          </section>
        </div>
      </section>

      <section className={styles.events} aria-labelledby="events-title">
        <header className={styles.sectionHeader}>
          <p>EVENT LEDGER / 事件沉淀</p>
          <h2 id="events-title">本轮形成的事件</h2>
          <span>资讯或多条人物观点都可以独立形成事件，不要求跨流交叉佐证。</span>
        </header>
        <div className={styles.eventGrid}>
          {snapshot.events.slice(0, 8).map((event) => (
            <article key={event.slug}>
              <p>{event.category}</p>
              <Link href={`/feed/${event.slug}`}>{event.title}</Link>
              <span>{event.judgment ?? event.summary}</span>
            </article>
          ))}
          {snapshot.events.length === 0 ? <p className={styles.noResult}>本轮暂未形成事件。</p> : null}
        </div>
      </section>

      <section className={styles.health} aria-labelledby="health-title">
        <header className={styles.sectionHeader}>
          <p>SOURCE HEALTH / 逐源账本</p>
          <h2 id="health-title">全部来源，不隐藏失败</h2>
          <span>“本轮无新内容”不等于故障；失败项保留真实错误，供后续修复或更换传输路径。</span>
        </header>
        <div className={styles.healthLegend} aria-label="来源状态图例">
          {(["succeeded", "partial", "empty", "failed"] as const).map((status) => (
            <span key={status} data-status={status}>{statusLabels[status]}</span>
          ))}
        </div>
        {PIPELINE_SECTIONS.map((section) => (
          <HealthLedger key={section} section={section} items={snapshot.sections[section]} />
        ))}
      </section>
    </main>
  );
}
