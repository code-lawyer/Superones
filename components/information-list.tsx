import Link from "next/link";
import type { InformationItem } from "@/lib/types";

export function InformationList({ items }: { items: InformationItem[] }) {
  return (
    <div className="information-list">
      {items.map((item) => (
        <article className="information-row" key={item.slug}>
          <Link className="information-row__link" href={`/feed/info/${item.slug}`}>
            <div className="information-row__main">
              <h2><span>{item.translatedTitle}</span></h2>
              <p className="information-row__original" lang={item.originalLanguage}>{item.originalTitle}</p>
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
}
