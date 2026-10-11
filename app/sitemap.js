import { fetchRouteIndex } from "../lib/sanity-content.mjs";
import { documentPath } from "../lib/sanity-cache.mjs";

const productionOrigin = "https://www.fiskum-sveis.no";

export const dynamic = "force-static";

export default async function sitemap() {
  return (await fetchRouteIndex())
    .filter((document) => !document.seoNoIndex)
    .map((document) => ({
      url: new URL(documentPath(document), productionOrigin).toString(),
      changeFrequency: document._type === "newsPost" ? "monthly" : "yearly",
      priority: document._type === "homePage" ? 1 : 0.7,
    }));
}
