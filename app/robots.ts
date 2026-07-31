import type { MetadataRoute } from "next";

function publicOrigin() {
  return (process.env.VAULT2077_PUBLIC_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/pipeline",
        "/sources/pipeline",
        "/opc/payment/",
      ],
    },
    sitemap: `${publicOrigin()}/sitemap.xml`,
  };
}
