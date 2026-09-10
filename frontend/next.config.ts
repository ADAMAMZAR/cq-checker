import type { NextConfig } from "next";

// Next.js static export (output: "export") forbids rewrites, so the two are
// mutually exclusive. Dev mode keeps rewrites so /api/* and /auth/* proxy to
// the local FastAPI backend.
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  trailingSlash: isStaticExport ? true : false,
  skipTrailingSlashRedirect: true,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2592000,
    unoptimized: isStaticExport ? true : false,
  },
  experimental: {
    proxyClientMaxBodySize: "100mb",
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  ...(isStaticExport
    ? { output: "export" as const }
    : {
        async redirects() {
          return [
            {
              source: "/dashboard",
              destination: "/",
              permanent: false,
            },
          ];
        },
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://127.0.0.1:8000/api/:path*",
            },
            {
              source: "/auth/:path*",
              destination: "http://127.0.0.1:8000/auth/:path*",
            },
          ];
        },
      }),
};

export default nextConfig;
