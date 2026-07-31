import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { encodeFeedSlug, matchesFeedSlug } from "@/lib/feed-route";
import { getPublicContent } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const content = await getPublicContent();
  const item = content.information.find((entry) => matchesFeedSlug(entry.slug, slug));
  return { title: item?.translatedTitle ?? "路边社记录" };
}

export default async function RoadsideDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, content] = await Promise.all([params, getPublicContent()]);
  const item = content.information.find((entry) => matchesFeedSlug(entry.slug, slug));
  if (!item) notFound();
  const group = item.contentGroup ?? (item.sourceStream === "statements" ? "roadside" : item.sourceStream);
  if (group !== "roadside") notFound();
  redirect(`/feed?roadsideItem=${encodeFeedSlug(item.slug)}#roadside-stream`);
}
