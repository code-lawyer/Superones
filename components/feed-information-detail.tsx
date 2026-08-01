import Link from "next/link";
import { ContentMarkup } from "@/components/content-markup";
import { informationTime } from "@/lib/feed-format";
import { cleanStatementText } from "@/lib/statement-text";
import type { EventRecord, InformationItem } from "@/lib/types";

export function FeedInformationDetail({
  item,
  relatedEvents,
  section,
}: {
  item: InformationItem;
  relatedEvents: EventRecord[];
  section: "information" | "roadside" | "documents";
}) {
  const roadside = section === "roadside";
  const returnHref = section === "documents" ? "/sic#sic-group-documents" : roadside ? "/feed#roadside-stream" : "/feed#information-waterfall";
  const sectionLabel = section === "documents" ? "SiC 档案" : roadside ? "Vault 路边社" : "Vault 资讯瀑布";
  const sourceUrl = item.originUrl ?? item.sourceUrl;
  const isX = item.originPlatform === "x";
  const community = item.publisherKind === "community_user" || item.publisherKind === "community";
  return (
    <article className="shell feed-detail information-detail">
      <header className="feed-detail__header">
        <div className="feed-detail__kicker mono">
          <Link href={returnHref}>{sectionLabel}</Link>
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
            {roadside
              ? <p>{cleanStatementText(item.translatedContent)}</p>
              : <ContentMarkup content={item.translatedContent} format={item.contentFormat} />}
          </section>
          <section className="information-copy information-copy--original" lang={item.originalLanguage}>
            <p className="detail-section-label mono">{item.originalDisplay === "full" ? "原始正文" : "原始正文摘录"}</p>
            <h2>{item.originalTitle}</h2>
            {roadside
              ? <p>{cleanStatementText(item.originalContent)}</p>
              : <ContentMarkup content={item.originalContent} format={item.contentFormat} />}
          </section>
          <a className="original-source-action" href={sourceUrl} target="_blank" rel="noreferrer">
            {isX ? "查看原始 X 言论" : "查看原始发布"}
          </a>
          {community && item.externalUrl ? (
            <a className="original-source-action" href={item.externalUrl} target="_blank" rel="noreferrer">
              查看社区条目指向的外链（未递归抓取）
            </a>
          ) : null}
        </div>
        <aside className="feed-detail__aside">
          <section>
            <p className="detail-section-label mono">来源</p>
            <dl className="detail-register">
              <div><dt>发布者</dt><dd>{item.sourceName}</dd></div>
              <div><dt>{community ? "社区身份" : roadside ? "人物 / 作者" : "作者"}</dt><dd>{community ? `${item.author || "匿名"}（未核验）` : item.author || item.sourceName}</dd></div>
              {isX && item.originAccount ? <div><dt>X 账号</dt><dd>@{item.originAccount.replace(/^@/, "")}</dd></div> : null}
              <div><dt>来源角色</dt><dd>{item.sourceRole}</dd></div>
              <div><dt>原始时间</dt><dd>{informationTime(item, true)}</dd></div>
            </dl>
          </section>
          <section>
            <p className="detail-section-label mono">所属事件</p>
            <div className="information-events">
              {relatedEvents.length > 0
                ? relatedEvents.map((event) => <Link href={`/feed/${event.slug}`} key={event.slug}>{event.title}</Link>)
                : <span>尚未沉淀为事件</span>}
            </div>
          </section>
          <Link className="report-link" href={`/corrections?record=${encodeURIComponent(item.slug)}&type=information`}>报告问题</Link>
        </aside>
      </div>
    </article>
  );
}
