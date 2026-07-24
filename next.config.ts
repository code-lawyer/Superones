import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep dev artifacts away from production builds. Running `next build` while
  // a dev server is open must not invalidate the dev server's asset manifest.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  // The in-app browser uses 127.0.0.1 while Next advertises localhost.
  // Allow the dev HMR endpoint to serve that same local origin.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
