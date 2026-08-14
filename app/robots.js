const productionOrigin = "https://www.fiskum-sveis.no";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/studio/", "/preview/", "/api/"],
    },
    sitemap: `${productionOrigin}/sitemap.xml`,
    host: productionOrigin,
  };
}
