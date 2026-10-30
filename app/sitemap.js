import { fetchRouteIndex } from "../lib/sanity-content.mjs";
import { isPreviewDeployment } from "../lib/site-config.mjs";
import { sitemapEntries } from "../lib/sitemap.mjs";

export const dynamic = "force-static";

export default async function sitemap() {
  if (isPreviewDeployment()) return [];
  return sitemapEntries(await fetchRouteIndex());
}
