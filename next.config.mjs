import { isPreviewDeployment } from "./lib/site-config.mjs";

const nextConfig = {
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
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
