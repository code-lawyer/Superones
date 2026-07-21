import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { events } from "@/lib/data";

export function generateStaticParams() {
  return events.map((event) => ({ slug: event.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = events.find((item) => item.slug === slug);
  return { title: event?.title ?? "事件记录" };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const event = events.find((item) => item.slug === slug);
  if (!event) notFound();

  return (
    <article className="detail-page shell">
      <header className="detail-header">
        <div className="detail-kicker mono"><Link href="/feed">VAULT / FEED</Link><span>{event.record}</span><span>AI 摘要</span></div>
        <h1>{event.title}</h1>
        <p className="original-title">{event.originalTitle}</p>
        <div className="detail-meta mono"><span>首次 {event.firstSeen}</span><span>更新 {event.updated}</span><span>{event.sources.length} 个来源</span></div>
      </header>
      <div className="detail-layout">
        <div className="detail-body">
          <section>
            <p className="detail-lead">{event.summary}</p>
          </section>
          <section>
            <h2>为什么值得关注</h2>
            <p>{event.significance}</p>
          </section>
          <section>
            <h2>事件进展</h2>
            <ol className="timeline">
              {event.timeline.map((entry) => <li key={`${entry.time}-${entry.text}`}><time className="mono">{entry.time}</time><p>{entry.text}</p></li>)}
            </ol>
          </section>
          <section>
            <h2>原始来源</h2>
            <div className="source-list">
              {event.sources.map((source, index) => (
                <a href={source.url} key={source.url} target="_blank" rel="noreferrer">
                  <span className="mono">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{source.name}</strong>
                  <time className="mono">{source.publishedAt}</time>
                  <span className="text-link">阅读原文</span>
                </a>
              ))}
            </div>
          </section>
        </div>
        <aside className="detail-aside">
          <p className="eyebrow mono">ENTITIES</p>
          {event.entities.map((entity) => <p key={entity}>{entity}</p>)}
          <div className="aside-note">
            <p className="eyebrow mono">DISCLOSURE</p>
            <p>本页由模型根据列出的公开来源生成。请以原文为准。</p>
            <Link className="text-link" href="/corrections">提交纠错</Link>
          </div>
        </aside>
      </div>
    </article>
  );
}
