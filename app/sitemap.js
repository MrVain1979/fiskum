import { fetchRouteIndex } from "../lib/sanity-content.mjs";
import { isPreviewDeployment } from "../lib/site-config.mjs";
import { sitemapEntries } from "../lib/sitemap.mjs";

// A static metadata response stayed stale after successful signed revalidation.
// Read the published index per XML request; page caches and their tags are unchanged.
export const dynamic = "force-dynamic";

export default async function sitemap() {
  if (isPreviewDeployment()) return [];
  return sitemapEntries(await fetchRouteIndex(fetch, true));
}
