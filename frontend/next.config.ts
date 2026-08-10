import type { NextConfig } from "next";

// Next.js 16 static export (output: "export") forbids rewrites, so the two are
// mutually exclusive. Dev mode keeps rewrites so /api/* proxies to the local
// FastAPI backend; static export builds (Phase 8: `STATIC_EXPORT=1`) drop them
// and instead reach the backend through NEXT_PUBLIC_API_URL baked at build time.
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  trailingSlash: true,
  experimental: {
    middlewareClientMaxBodySize: "100mb",
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
  ...(isStaticExport
    ? { output: "export" as const }
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://127.0.0.1:8000/api/:path*",
            },
          ];
        },
      }),
};

export default nextConfig;
