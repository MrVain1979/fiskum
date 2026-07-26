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
        ],
      },
    ];
  },
};

export default nextConfig;
