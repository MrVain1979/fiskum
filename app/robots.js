import { isPreviewDeployment, productionOrigin } from "../lib/site-config.mjs";

export default function robots() {
  if (isPreviewDeployment()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/preview/", "/api/"],
    },
    sitemap: `${productionOrigin}/sitemap.xml`,
    host: productionOrigin,
  };
}
