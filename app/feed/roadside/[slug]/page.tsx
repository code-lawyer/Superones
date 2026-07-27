import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FeedInformationDetail } from "@/components/feed-information-detail";
import { matchesFeedSlug } from "@/lib/feed-route";
import { getCachedPublicContent } from "@/lib/public-read-cache";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const content = await getCachedPublicContent();
  const item = content.information.find((entry) => matchesFeedSlug(entry.slug, slug));
  return { title: item?.translatedTitle ?? "路边社记录" };
}

export default async function RoadsideDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, content] = await Promise.all([params, getCachedPublicContent()]);
  const item = content.information.find((entry) => matchesFeedSlug(entry.slug, slug));
  if (!item) notFound();
  const group = item.contentGroup ?? (item.sourceStream === "statements" ? "roadside" : item.sourceStream);
  if (group !== "roadside") notFound();
  return (
    <FeedInformationDetail
      item={item}
      relatedEvents={content.events.filter((event) => item.eventSlugs.includes(event.slug))}
      section="roadside"
    />
  );
}
