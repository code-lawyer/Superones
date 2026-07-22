import type { Metadata } from "next";
import { EventList } from "@/components/event-list";
import { PageIntro } from "@/components/page-intro";
import { StatusBar } from "@/components/status-bar";
import { getPublicContent } from "@/lib/public-content";

export const metadata: Metadata = { title: "Vault 信息流" };

const filters = ["重要更新", "最新", "公司", "人物", "产品", "播客", "公告", "文章"];

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const content = await getPublicContent();
  return (
    <>
      <StatusBar state={content.state} />
      <PageIntro code="VAULT / FEED" title="把全网更新，压缩成值得跟进的事件。" lead="白名单来源自动采集，境内 LLM 完成翻译、摘要和事件聚合。每条记录保留原文、时间和来源。" meta={content.state.mode === "live" ? `UPDATED ${content.state.updatedAt ?? ""} / ${content.events.length} EVENTS` : "UPDATED 2026.07.21 14:32 CST / 8 DEMO EVENTS"} />
      <section className="shell content-section">
        <div className="filter-row" aria-label="信息流筛选">
          {filters.map((filter, index) => <button className={index === 0 ? "filter-button is-active" : "filter-button"} type="button" key={filter}>{filter}</button>)}
        </div>
        <EventList items={content.events} />
      </section>
    </>
  );
}
