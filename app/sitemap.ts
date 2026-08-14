import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

const PUBLIC_ROUTES = [
  "",
  "/feed",
  "/opc",
  "/opc/refund",
  "/sic",
  "/frontier",
  "/frontier/ranking",
  "/about",
  "/methodology",
  "/sources",
  "/corrections",
  "/legal",
  "/legal/opc-service-rules",
  "/legal/frontier-rules",
  "/legal/ranger-notice",
  "/privacy",
  "/terms",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = (process.env.VAULT2077_PUBLIC_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
  return PUBLIC_ROUTES.map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
