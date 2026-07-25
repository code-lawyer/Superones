import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep dev artifacts away from production builds. Running `next build` while
  // a dev server is open must not invalidate the dev server's asset manifest.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // The in-app browser uses 127.0.0.1 while Next advertises localhost.
  // Allow the dev HMR endpoint to serve that same local origin.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      { key: "X-Frame-Options", value: "DENY" },
    ];

    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
