import { isPreviewDeployment } from "./lib/site-config.mjs";

const nextConfig = {
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "fiskum-studio.vercel.app" }],
        destination: "https://www.fiskum-sveis.no/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/studio/:path*",
        destination: "/studio/index.html",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/studio/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
      ...(isPreviewDeployment() ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }] }] : []),
    ];
  },
};

export default nextConfig;
