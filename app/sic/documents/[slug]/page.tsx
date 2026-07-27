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
  return { title: item?.translatedTitle ?? "文档记录" };
}

export default async function DocumentDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, content] = await Promise.all([params, getCachedPublicContent()]);
  const item = content.information.find((entry) => matchesFeedSlug(entry.slug, slug));
  if (!item || item.contentGroup !== "documents") notFound();
  return (
    <FeedInformationDetail
      item={item}
      relatedEvents={content.events.filter((event) => item.eventSlugs.includes(event.slug))}
      section="documents"
    />
  );
}
