import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { informationTime } from "@/lib/feed-format";
import { matchesFeedSlug } from "@/lib/feed-route";
import { getPublicContent } from "@/lib/public-content";
import { cleanStatementText } from "@/lib/statement-text";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const content = await getPublicContent();
  const item = content.information.find((entry) => matchesFeedSlug(entry.slug, slug));
  return { title: item?.translatedTitle ?? "资讯记录" };
}

export default async function InformationDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, content] = await Promise.all([params, getPublicContent()]);
  const item = content.information.find((entry) => matchesFeedSlug(entry.slug, slug));
  if (!item) notFound();
  const relatedEvents = content.events.filter((event) => item.eventSlugs.includes(event.slug));
  const isStatement = item.sourceStream === "statements";
  const sourceUrl = isStatement ? item.originUrl ?? item.sourceUrl : item.sourceUrl;
  const returnHref = isStatement ? "/feed#statements-stream" : "/feed#information-waterfall";

  return (
    <article className="shell feed-detail information-detail">
      <header className="feed-detail__header">
        <div className="feed-detail__kicker mono">
          <Link href={returnHref}>{isStatement ? "Vault 名人说" : "Vault 资讯瀑布"}</Link>
          <span>{item.sourceRole}</span>
          <span>{informationTime(item, true)}</span>
        </div>
        <h1>{item.translatedTitle}</h1>
        <p className="feed-detail__judgment">{item.summary}</p>
      </header>

      <div className="feed-detail__layout">
        <div className="feed-detail__body">
          <section className="information-copy">
            <p className="detail-section-label mono">中文处理结果</p>
            <p>{isStatement ? cleanStatementText(item.translatedContent) : item.translatedContent}</p>
          </section>
          <section className="information-copy information-copy--original" lang={item.originalLanguage}>
            <p className="detail-section-label mono">{item.originalDisplay === "full" ? "英文原文" : "英文原文摘录"}</p>
            <h2>{item.originalTitle}</h2>
            <p>{isStatement ? cleanStatementText(item.originalContent) : item.originalContent}</p>
          </section>
          <a className="original-source-action" href={sourceUrl} target="_blank" rel="noreferrer">
            {isStatement ? "查看原始 X 言论" : "查看原始来源"}
          </a>
        </div>

        <aside className="feed-detail__aside">
          <section>
            <p className="detail-section-label mono">来源</p>
            <dl className="detail-register">
              <div><dt>发布者</dt><dd>{item.sourceName}</dd></div>
              <div><dt>{isStatement ? "人物" : "作者"}</dt><dd>{isStatement ? item.sourceName : item.author}</dd></div>
              {isStatement && item.originAccount ? <div><dt>X 账号</dt><dd>@{item.originAccount.replace(/^@/, "")}</dd></div> : null}
              <div><dt>来源角色</dt><dd>{item.sourceRole}</dd></div>
              <div><dt>原始时间</dt><dd>{informationTime(item, true)}</dd></div>
            </dl>
          </section>
          <section>
            <p className="detail-section-label mono">所属事件</p>
            <div className="information-events">
              {relatedEvents.length > 0 ? relatedEvents.map((event) => <Link href={`/feed/${event.slug}`} key={event.slug}>{event.title}</Link>) : <span>尚未沉淀为事件</span>}
            </div>
          </section>
          <Link className="report-link" href={`/corrections?record=${encodeURIComponent(item.slug)}&type=information`}>报告问题</Link>
        </aside>
      </div>
    </article>
  );
}
