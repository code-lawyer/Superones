import Link from "next/link";
import { beijingTime } from "@/lib/feed-format";
import { roadsideHref } from "@/lib/feed-route";
import { cleanStatementText } from "@/lib/statement-text";
import type { InformationItem } from "@/lib/types";

function personName(item: InformationItem) {
  return item.sourceName;
}

function account(item: InformationItem) {
  if (item.publisherKind === "community_user" || item.publisherKind === "community") {
    return "未核验社区身份";
  }
  const value = item.originAccount?.replace(/^@/, "").trim();
  return value ? `@${value}` : "个人博客";
}

export function RoadsideList({ items }: { items: InformationItem[] }) {
  return (
    <div className="statement-list">
      {items.map((item) => (
        <article className="statement-row" key={item.slug}>
          <Link className="statement-row__link" href={roadsideHref(item.slug)}>
            <header>
              <strong>{personName(item)}</strong>
              <span className="mono">{account(item)}</span>
              <time>{beijingTime(item.publishedAt)}</time>
            </header>
            <p>{cleanStatementText(item.translatedContent || item.summary)}</p>
          </Link>
          <a
            className="statement-row__source mono"
            href={item.originUrl ?? item.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            {item.originPlatform === "x" ? "原始 X" : "原始发布"}
          </a>
        </article>
      ))}
    </div>
  );
}
