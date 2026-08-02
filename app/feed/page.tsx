import type { Metadata } from "next";
import Link from "next/link";
import { ChannelRibbon } from "@/components/channel-ribbon";
import { EventList } from "@/components/event-list";
import { InformationList } from "@/components/information-list";
import { MobileTaskNav, MobileTaskNavLink } from "@/components/mobile-task-nav";
import { PageIntro } from "@/components/page-intro";
import { RoadsideList } from "@/components/statement-list";
import { beijingTime, compareEventsNewest, compareInformationNewest } from "@/lib/feed-format";
import { getPublicContent } from "@/lib/public-content";

export const metadata: Metadata = { title: "Vault 信息流" };
export const dynamic = "force-dynamic";

const EVENT_LIMIT = 10;
const WATERFALL_LIMIT = 5;
const STATEMENT_LIMIT = 5;

type FeedSearchParams = Record<string, string | string[] | undefined>;
type FeedState = {
  eventLimit: number;
  waterfallLimit: number;
  roadsideLimit: number;
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
  if (next.eventLimit > EVENT_LIMIT) query.set("events", String(next.eventLimit));
  if (next.waterfallLimit > WATERFALL_LIMIT) query.set("waterfall", String(next.waterfallLimit));
  if (next.roadsideLimit > STATEMENT_LIMIT) query.set("roadside", String(next.roadsideLimit));
  const suffix = query.toString();
  const anchor = override.eventLimit
    ? "event-ledger"
    : override.roadsideLimit
      ? "roadside-stream"
      : "information-waterfall";
  return `${suffix ? `/feed?${suffix}` : "/feed"}#${anchor}`;
}

export default async function FeedPage({ searchParams }: { searchParams: Promise<FeedSearchParams> }) {
  const [content, params] = await Promise.all([getPublicContent(), searchParams]);
  const state: FeedState = {
    eventLimit: positiveLimit(valueOf(params.events), EVENT_LIMIT),
    waterfallLimit: positiveLimit(valueOf(params.waterfall), WATERFALL_LIMIT),
    roadsideLimit: positiveLimit(valueOf(params.roadside ?? params.statements), STATEMENT_LIMIT),
  };
  const requestedRoadsideSlug = valueOf(params.roadsideItem);

  const eventItems = [...content.events]
    .sort(compareEventsNewest);
  const informationItems = content.information
    .filter((item) => (item.contentGroup ?? item.sourceStream) === "information")
    .sort(compareInformationNewest);
  const roadsideItems = content.information
    .filter((item) => (
      (item.contentGroup ?? item.sourceStream) === "roadside" || item.sourceStream === "statements"
    ))
    .sort(compareInformationNewest);
  const visibleEvents = eventItems.slice(0, state.eventLimit);
  const visibleInformation = informationItems.slice(0, state.waterfallLimit);
  const visibleRoadside = roadsideItems.slice(0, state.roadsideLimit);
  const updatedAt = content.state.updatedAt;
  const previewLabel = process.env.VAULT2077_CONTENT_PREVIEW_LABEL?.trim();
  const modeLabel = previewLabel
    ? ` / ${previewLabel}`
    : content.state.mode === "degraded"
        ? " / 更新延迟"
        : "";

  return (
    <div className="feed-page">
      <PageIntro
        className="channel-page-intro"
        code="VAULT / INFORMATION FLOW"
        title="维度收束，视界引擎"
        lead="全球 AI 资讯经翻译与摘要后流经资讯瀑布；只有多条信息共同构成值得持续追踪的变化，才沉淀为事件。"
        meta={`LAST PUBLISHED ${beijingTime(updatedAt, true)}${modeLabel}`}
      />
      <MobileTaskNav ariaLabel="信息流快速索引" sticky>
        <MobileTaskNavLink code="01 / LEDGER" href="#event-ledger" label="最新事件" />
        <MobileTaskNavLink code="02 / FLOW" href="#information-waterfall" label="资讯瀑布" />
        <MobileTaskNavLink code="03 / VOICES" href="#roadside-stream" label="路边社" />
      </MobileTaskNav>
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
            {visibleEvents.length < eventItems.length ? (
              <Link className="feed-more" href={feedHref(state, { eventLimit: state.eventLimit + EVENT_LIMIT })}>
                <span>展开更多事件</span>
                <span className="mono">{visibleEvents.length} / {eventItems.length}</span>
              </Link>
            ) : null}
          </section>

          <aside className="feed-column feed-column--streams" aria-label="原始信息流">
            <section className="feed-stream feed-stream--waterfall" id="information-waterfall" aria-labelledby="information-waterfall-title">
              <header className="feed-column__header">
                <p className="eyebrow mono">INFORMATION WATERFALL / 流动</p>
                <h2 id="information-waterfall-title">资讯瀑布</h2>
                <p>境外正式资讯经翻译与摘要后，按原始时间持续流过。</p>
              </header>
              <InformationList items={visibleInformation} />
              {visibleInformation.length === 0 ? <p className="feed-empty">暂无资讯</p> : null}
              {visibleInformation.length < informationItems.length ? (
                <Link className="feed-more" href={feedHref(state, { waterfallLimit: state.waterfallLimit + WATERFALL_LIMIT })}>
                  <span>展开更多资讯</span>
                  <span className="mono">{visibleInformation.length} / {informationItems.length}</span>
                </Link>
              ) : null}
            </section>

            <section className="feed-stream feed-stream--statements" id="roadside-stream" aria-labelledby="roadside-stream-title">
              <header className="feed-column__header">
                <p className="eyebrow mono">ROADSIDE / 个人与社区</p>
                <h2 id="roadside-stream-title">路边社</h2>
                <p>自然人言论、个人博客及社区原生条目。</p>
              </header>
              <RoadsideList
                items={visibleRoadside}
                initialItem={requestedRoadsideSlug
                  ? roadsideItems.find((item) => item.slug === requestedRoadsideSlug)
                  : undefined}
              />
              {visibleRoadside.length === 0 ? <p className="feed-empty">暂无个人或社区发布</p> : null}
              {visibleRoadside.length < roadsideItems.length ? (
                <Link className="feed-more" href={feedHref(state, { roadsideLimit: state.roadsideLimit + STATEMENT_LIMIT })}>
                  <span>展开更多路边社</span>
                  <span className="mono">{visibleRoadside.length} / {roadsideItems.length}</span>
                </Link>
              ) : null}
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}
