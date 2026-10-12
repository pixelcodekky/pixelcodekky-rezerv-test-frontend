import type { NextConfig } from "next";

// The Rezerv API (ASP.NET) has no CORS policy, so the browser calls /api/* on this origin
// and Next.js proxies it to the backend.
const apiBaseUrl = (process.env.API_BASE_URL ?? "{YOUR_API_URL}").replace(/\/$/, "");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiBaseUrl}/api/:path*` }];
  },
};

export default nextConfig;
