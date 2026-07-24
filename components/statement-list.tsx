import Link from "next/link";
import { beijingTime } from "@/lib/feed-format";
import { informationHref } from "@/lib/feed-route";
import { cleanStatementText } from "@/lib/statement-text";
import type { InformationItem } from "@/lib/types";

function personName(item: InformationItem) {
  return item.sourceName;
}

function account(item: InformationItem) {
  const value = item.originAccount?.replace(/^@/, "").trim();
  return value ? `@${value}` : "X 账号待核验";
}

export function StatementList({ items }: { items: InformationItem[] }) {
  return (
    <div className="statement-list">
      {items.map((item) => (
        <article className="statement-row" key={item.slug}>
          <Link className="statement-row__link" href={informationHref(item.slug)}>
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
            原始 X
          </a>
        </article>
      ))}
    </div>
  );
}
