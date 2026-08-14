import {
  allDocuments,
  fetchContent,
  routeFor,
} from "../scripts/build-static.mjs";

const productionOrigin = "https://www.fiskum-sveis.no";

export const dynamic = "force-static";

export default async function sitemap() {
  const data = await fetchContent({
    cache: "force-cache",
    next: { tags: ["site-shell"] },
  });

  return allDocuments(data)
    .filter((document) => !document.seoNoIndex)
    .map((document) => ({
      url: new URL(routeFor(document), productionOrigin).toString(),
      changeFrequency: document._type === "newsPost" ? "monthly" : "yearly",
      priority: document._type === "homePage" ? 1 : 0.7,
    }));
}
