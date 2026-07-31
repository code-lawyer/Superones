import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentMarkup } from "@/components/content-markup";
import { beijingTime, eventCategory, eventJudgment, informationTime } from "@/lib/feed-format";
import { documentHref, eventHref, informationHref, matchesFeedSlug, roadsideHref } from "@/lib/feed-route";
import { getPublicContent } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const content = await getPublicContent();
  const event = content.events.find((item) => matchesFeedSlug(item.slug, slug));
  return { title: event?.title ?? "事件记录" };
}

function citationHref(eventSlug: string, number: number, visibleSourceCount: number) {
  if (number <= visibleSourceCount) return `#source-${number}`;
  const requiredLimit = Math.ceil(number / 20) * 20;
  return `${eventHref(eventSlug)}?related=${requiredLimit}#source-${number}`;
}

function CitedText({
  text,
  sourceCount,
  visibleSourceCount,
  eventSlug,
}: {
  text: string;
  sourceCount: number;
  visibleSourceCount: number;
  eventSlug: string;
}) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, index) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (!match) return part;
    const number = Number(match[1]);
    if (number < 1 || number > sourceCount) return null;
    return (
      <sup className="citation" key={`${part}-${index}`}>
        <a
          href={citationHref(eventSlug, number, visibleSourceCount)}
          aria-label={`查看证据 ${number}`}
          title={`查看证据 ${number}`}
        >
          {number}
        </a>
      </sup>
    );
  });
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ related?: string | string[] }>;
}) {
  const [{ slug }, content, query] = await Promise.all([params, getPublicContent(), searchParams]);
  const event = content.events.find((item) => matchesFeedSlug(item.slug, slug));
  if (!event) notFound();

  const currentBySlug = new Map(content.information.map((item) => [item.slug, item]));
  const related = content.information.filter((item) => item.eventSlugs.includes(event.slug));
  const evidence = event.sources?.length
    ? event.sources.map((source) => ({ source, item: source.informationSlug ? currentBySlug.get(source.informationSlug) : undefined }))
    : related
        .sort((left, right) => Date.parse(left.publishedAt ?? left.discoveredAt) - Date.parse(right.publishedAt ?? right.discoveredAt))
        .map((item) => ({
          source: {
            name: item.sourceName,
            url: item.sourceUrl,
            publishedAt: item.publishedAt ?? item.discoveredAt,
            author: item.author,
            role: item.sourceRole,
            informationSlug: item.slug,
            translatedTitle: item.translatedTitle,
            originalTitle: item.originalTitle,
            summary: item.summary,
            translatedContent: item.translatedContent,
            originalContent: item.originalContent,
            contentFormat: item.contentFormat,
            originalLanguage: item.originalLanguage,
            originalDisplay: item.originalDisplay,
            contentGroup: item.contentGroup,
            sourceStream: item.sourceStream,
          },
          item,
        }));
  const requestedLimit = Number.parseInt(Array.isArray(query.related) ? query.related[0] : query.related ?? "", 10);
  const relatedLimit = Number.isFinite(requestedLimit) && requestedLimit > 20 ? Math.min(requestedLimit, 500) : 20;
  const visibleEvidence = evidence.slice(0, relatedLimit);
  const paragraphs = event.summary.split(/\n\s*\n/).filter(Boolean);

  return (
    <article className="shell feed-detail feed-detail--event event-dossier">
      <header className="feed-detail__header">
        <div className="feed-detail__kicker mono">
          <Link href="/feed">返回事件簿</Link>
          <span>事件档案</span>
        </div>
        <h1>{event.title}</h1>
        <p className="feed-detail__judgment">
          <CitedText
            text={eventJudgment(event)}
            sourceCount={evidence.length}
            visibleSourceCount={visibleEvidence.length}
            eventSlug={event.slug}
          />
        </p>
        <p className="feed-detail__ai">
          <Link href="/methodology">由 AI 基于公开来源自动编排</Link>
        </p>
        <dl className="event-dossier__facts" aria-label="事件记录信息">
          <div>
            <dt>分类</dt>
            <dd>{eventCategory(event)}</dd>
          </div>
          <div>
            <dt>证据</dt>
            <dd>{evidence.length} 条资讯</dd>
          </div>
          <div>
            <dt>记录编号</dt>
            <dd>{event.record}</dd>
          </div>
          <div>
            <dt>最后更新</dt>
            <dd>{beijingTime(event.updated, true)}</dd>
          </div>
        </dl>
      </header>

      <div className="event-dossier__content">
        <section className="event-dossier__summary event-summary" aria-labelledby="event-summary-title">
          <h2 className="detail-section-label mono" id="event-summary-title">综合摘要</h2>
          <div className="event-dossier__summary-copy">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>
                <CitedText
                  text={paragraph}
                  sourceCount={evidence.length}
                  visibleSourceCount={visibleEvidence.length}
                  eventSlug={event.slug}
                />
              </p>
            ))}
          </div>
        </section>

        <section className="event-dossier__entities" aria-labelledby="event-entities-title">
          <h2 className="detail-section-label mono" id="event-entities-title">关键实体</h2>
          <ul>
            {event.entities.map((entity) => <li key={entity}>{entity}</li>)}
          </ul>
        </section>

        <section className="related-information event-dossier__evidence" id="related" aria-labelledby="related-title">
          <div className="related-information__head">
            <h2 className="detail-section-label mono" id="related-title">证据记录 · 共 {evidence.length} 条</h2>
            <p>按事件证据编号</p>
          </div>
          <div className="source-timeline">
            {visibleEvidence.map(({ source, item }, index) => {
              const translatedContent = item?.translatedContent ?? source.translatedContent ?? source.summary ?? "";
              const originalContent = item?.originalContent ?? source.originalContent ?? source.originalTitle ?? "";
              const title = item?.translatedTitle ?? source.translatedTitle ?? source.originalTitle ?? source.name;
              const originalTitle = item?.originalTitle ?? source.originalTitle ?? title;
              return (
              <article className="source-record" id={`source-${index + 1}`} key={`${source.url}:${index}`}>
                <div className="source-record__index mono">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <time>{item ? informationTime(item) : beijingTime(source.publishedAt)}</time>
                </div>
                <div className="source-record__content">
                  <div className="source-record__meta mono">
                    <span>{source.name}</span>
                    {source.role ? <span>{source.role}</span> : null}
                    {source.author ? <span>{source.author}</span> : null}
                  </div>
                  <h2>
                    {item ? <Link href={
                      item.contentGroup === "documents"
                        ? documentHref(item.slug)
                        : (item.contentGroup ?? item.sourceStream) === "roadside" || item.sourceStream === "statements"
                        ? roadsideHref(item.slug)
                        : informationHref(item.slug)
                    }>
                      {title}
                    </Link> : <a href={source.url} target="_blank" rel="noreferrer">{title}</a>}
                  </h2>
                  <ContentMarkup content={translatedContent} format={item?.contentFormat ?? source.contentFormat} />
                  {originalContent ? <details className="source-record__original">
                    <summary>
                      {(item?.originalDisplay ?? source.originalDisplay) === "full" ? "查看英文原文" : "查看英文原文摘录"}
                    </summary>
                    <div className="source-record__original-copy" lang={item?.originalLanguage ?? source.originalLanguage}>
                      <h3>{originalTitle}</h3>
                      <ContentMarkup content={originalContent} format={item?.contentFormat ?? source.contentFormat} />
                    </div>
                  </details> : null}
                  <a className="source-record__external" href={source.url} target="_blank" rel="noreferrer">打开原始来源 ↗</a>
                </div>
              </article>
              );
            })}
          </div>
          {visibleEvidence.length < evidence.length ? (
            <Link className="feed-more" href={`${eventHref(event.slug)}?related=${relatedLimit + 20}#related`}>
              <span>继续加载相关资讯</span>
              <span className="mono">{visibleEvidence.length} / {evidence.length}</span>
            </Link>
          ) : null}
        </section>

        <footer className="event-dossier__footer">
          <Link className="report-link" href={`/corrections?record=${encodeURIComponent(event.record)}&type=event`}>报告问题</Link>
        </footer>
      </div>
    </article>
  );
}
