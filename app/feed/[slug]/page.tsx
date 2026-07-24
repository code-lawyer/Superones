import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { beijingTime, eventCategory, eventJudgment, informationTime } from "@/lib/feed-format";
import { getPublicContent } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const content = await getPublicContent();
  const event = content.events.find((item) => item.slug === slug);
  return { title: event?.title ?? "事件记录" };
}

function CitedText({ text, sourceCount }: { text: string; sourceCount: number }) {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, index) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (!match) return part;
    const number = Number(match[1]);
    if (number < 1 || number > sourceCount) return null;
    return <a className="citation" href={`#source-${number}`} key={`${part}-${index}`}>{part}</a>;
  });
}

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, content] = await Promise.all([params, getPublicContent()]);
  const event = content.events.find((item) => item.slug === slug);
  if (!event) notFound();

  const related = content.information
    .filter((item) => item.eventSlugs.includes(event.slug))
    .sort((left, right) => Date.parse(left.publishedAt ?? left.discoveredAt) - Date.parse(right.publishedAt ?? right.discoveredAt));
  const paragraphs = event.summary.split(/\n\s*\n/).filter(Boolean);

  return (
    <article className="shell feed-detail">
      <header className="feed-detail__header">
        <div className="feed-detail__kicker mono">
          <Link href="/feed">Vault 信息流</Link>
          <span>{eventCategory(event)}</span>
          <span>{beijingTime(event.updated, true)}</span>
        </div>
        <h1>{event.title}</h1>
        <p className="feed-detail__judgment">{eventJudgment(event)}</p>
        <p className="feed-detail__ai mono"><Link href="/methodology">由 AI 基于公开来源自动编排</Link></p>
      </header>

      <div className="feed-detail__layout">
        <div className="feed-detail__body">
          <section className="event-summary" aria-labelledby="event-summary-title">
            <p className="detail-section-label mono" id="event-summary-title">综合摘要</p>
            {paragraphs.map((paragraph, index) => <p key={index}><CitedText text={paragraph} sourceCount={related.length} /></p>)}
          </section>

          <section className="related-information" id="related" aria-labelledby="related-title">
            <div className="related-information__head">
              <p className="detail-section-label mono" id="related-title">相关资讯 · 共 {related.length} 条</p>
              <p>按原始发布时间正序</p>
            </div>
            <div className="source-timeline">
              {related.map((item, index) => (
                <article className="source-record" id={`source-${index + 1}`} key={item.slug}>
                  <div className="source-record__index mono">
                    <span>[{String(index + 1).padStart(2, "0")}]</span>
                    <time>{informationTime(item)}</time>
                  </div>
                  <div className="source-record__content">
                    <div className="source-record__meta mono">
                      <span>{item.sourceName}</span>
                      <span>{item.sourceRole}</span>
                      <span>{item.author}</span>
                    </div>
                    <h2><Link href={`/feed/info/${item.slug}`}>{item.translatedTitle}</Link></h2>
                    <p>{item.translatedContent}</p>
                    <div className="source-record__original" lang={item.originalLanguage}>
                      <p className="mono">{item.originalDisplay === "full" ? "EN / ORIGINAL" : "EN / ORIGINAL EXCERPT"}</p>
                      <h3>{item.originalTitle}</h3>
                      <p>{item.originalContent}</p>
                    </div>
                    <a className="source-record__external" href={item.sourceUrl} target="_blank" rel="noreferrer">查看原始来源</a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="feed-detail__aside">
          <section>
            <p className="detail-section-label mono">核心实体</p>
            <div className="entity-list">{event.entities.map((entity) => <span key={entity}>{entity}</span>)}</div>
          </section>
          <section>
            <p className="detail-section-label mono">记录</p>
            <dl className="detail-register">
              <div><dt>编号</dt><dd>{event.record}</dd></div>
              <div><dt>最后更新</dt><dd>{beijingTime(event.updated, true)}</dd></div>
              <div><dt>资讯数量</dt><dd>{related.length}</dd></div>
            </dl>
          </section>
          <Link className="report-link" href={`/corrections?record=${encodeURIComponent(event.record)}&type=event`}>报告问题</Link>
        </aside>
      </div>
    </article>
  );
}
