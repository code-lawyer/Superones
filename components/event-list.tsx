import Link from "next/link";
import type { EventRecord } from "@/lib/types";

export function EventList({ items }: { items: EventRecord[] }) {
  return (
    <div className="record-list event-list">
      <div className="record-head mono" aria-hidden="true">
        <span>记录 / 时间</span>
        <span>类型</span>
        <span>事件</span>
        <span>来源 / 更新</span>
      </div>
      {items.map((item) => (
        <article className="record-row event-row" key={item.slug}>
          <div className="record-id mono">
            <span>{item.record}</span>
            <time>{item.firstSeen}</time>
          </div>
          <p className="record-category">{item.category}</p>
          <div className="record-main">
            <h3><Link href={`/feed/${item.slug}`}>{item.title}</Link></h3>
            <p>{item.summary}</p>
            <span className="ai-label mono">AI 摘要</span>
          </div>
          <div className="record-meta mono">
            <span>{item.sources.length} 个来源</span>
            <span>更新 {item.updated}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
