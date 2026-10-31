import {
  canonicalOverride,
  contentPath,
  productionOrigin,
} from "./content-path.ts";
export function sitemapEntries(documents) {
  return documents.flatMap((document) => {
    const path = contentPath(document);
    if (!path || document.seoNoIndex) return [];
    const own = new URL(path, productionOrigin).href,
      override = canonicalOverride(document.canonical);
    if (override.error || (override.url && override.url !== own)) return [];
    return [
      {
        url: override.url || own,
        changeFrequency: document._type === "newsPost" ? "monthly" : "yearly",
        priority: document._type === "homePage" ? 1 : 0.7,
      },
    ];
  });
}
