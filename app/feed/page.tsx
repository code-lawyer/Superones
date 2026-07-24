import type { Metadata } from "next";
import Link from "next/link";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { EventList } from "@/components/event-list";
import { InformationList } from "@/components/information-list";
import { PageIntro } from "@/components/page-intro";
import { siteStatus } from "@/lib/data";
import { beijingTime, compareEventsNewest, compareInformationNewest } from "@/lib/feed-format";
import { getPublicContent } from "@/lib/public-content";

export const metadata: Metadata = { title: "Vault 信息流" };
export const dynamic = "force-dynamic";

const EVENT_LIMIT = 10;
const WATERFALL_LIMIT = 15;

type FeedSearchParams = Record<string, string | string[] | undefined>;
type FeedState = {
  waterfallLimit: number;
};

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > fallback ? parsed : fallback;
}

function feedHref(state: FeedState, override: Partial<FeedState>) {
  const next = { ...state, ...override };
  const query = new URLSearchParams();
  if (next.waterfallLimit > WATERFALL_LIMIT) query.set("waterfall", String(next.waterfallLimit));
  const suffix = query.toString();
  return `${suffix ? `/feed?${suffix}` : "/feed"}#information-waterfall`;
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<FeedSearchParams> }) {
  const [content, params] = await Promise.all([getPublicContent(), searchParams]);
  const state: FeedState = {
    waterfallLimit: positiveLimit(valueOf(params.waterfall), WATERFALL_LIMIT),
  };

  const eventItems = [...content.events]
    .sort(compareEventsNewest);
  const informationItems = [...content.information]
    .sort(compareInformationNewest);
  const visibleEvents = eventItems.slice(0, EVENT_LIMIT);
  const visibleInformation = informationItems.slice(0, state.waterfallLimit);
  const updatedAt = content.state.updatedAt ?? siteStatus.updated;
  const previewLabel = process.env.VAULT2077_CONTENT_PREVIEW_LABEL?.trim();

  return (
    <>
      <PageIntro
        code="VAULT / INFORMATION FLOW"
        title="维度收束，视界引擎"
        lead="全球 AI 资讯经翻译与摘要后流经资讯瀑布；只有多条信息共同构成值得持续追踪的变化，才沉淀为事件。"
        meta={`LAST PUBLISHED ${beijingTime(updatedAt, true)}${previewLabel ? ` / ${previewLabel}` : content.state.mode === "demo" ? " / 示例数据" : ""}`}
      />
      <ChannelRibbon identity="VAULT INTEL" slogan="WITHIN THE LIGHT CONE LIES DESTINY." />

      <section className="shell feed-stage">
        <div className="feed-columns">
          <section className="feed-column feed-column--ledger" id="event-ledger" aria-labelledby="event-ledger-title">
            <header className="feed-column__header">
              <p className="eyebrow mono">EVENT LEDGER / 沉淀</p>
              <h2 id="event-ledger-title">事件簿</h2>
              <p>多条资讯共同指向，才留下一个事件。</p>
            </header>
            <EventList items={visibleEvents} />
            {visibleEvents.length === 0 ? <p className="feed-empty">暂无事件</p> : null}
          </section>

          <section className="feed-column feed-column--waterfall" id="information-waterfall" aria-labelledby="information-waterfall-title">
            <header className="feed-column__header">
              <p className="eyebrow mono">INFORMATION WATERFALL / 流动</p>
              <h2 id="information-waterfall-title">资讯瀑布</h2>
              <p>境外资讯经翻译与摘要后，按原始时间持续流过。</p>
            </header>
            <InformationList items={visibleInformation} />
            {visibleInformation.length === 0 ? <p className="feed-empty">暂无资讯</p> : null}
            {visibleInformation.length < informationItems.length ? (
              <Link className="feed-more" href={feedHref(state, { waterfallLimit: state.waterfallLimit + WATERFALL_LIMIT })}>
                <span>继续接收资讯</span>
                <span className="mono">{visibleInformation.length} / {informationItems.length}</span>
              </Link>
            ) : null}
          </section>
        </div>
      </section>
    </>
  );
}
