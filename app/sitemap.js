import { fetchRouteIndex } from "../lib/sanity-content.mjs";
import { documentPath } from "../lib/sanity-cache.mjs";
import { isPreviewDeployment, productionOrigin } from "../lib/site-config.mjs";

export const dynamic = "force-static";

export default async function sitemap() {
  if (isPreviewDeployment()) return [];
  return (await fetchRouteIndex())
    .filter((document) => !document.seoNoIndex)
    .map((document) => ({
      url: new URL(documentPath(document), productionOrigin).toString(),
      changeFrequency: document._type === "newsPost" ? "monthly" : "yearly",
      priority: document._type === "homePage" ? 1 : 0.7,
    }));
}
