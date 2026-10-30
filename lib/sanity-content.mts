import type { ClientReturn, QueryParams } from "@sanity/client";
import type {
  DocumentQueryResult,
  SettingsQueryResult,
  NavbarQueryResult,
  FooterQueryResult,
  FaqsQueryResult,
  RedirectsQueryResult,
  ServicesQueryResult,
  ReferencesQueryResult,
  NewsQueryResult,
} from "../sanity.types.js";
import { queryUrl } from "./render-content.mjs";
import {
  collectionTag,
  collectionTypesForPath,
  documentPath,
  documentTag,
  normalizePath,
  redirectTag,
  routeTag,
  shellTag,
  sitemapTag,
} from "./sanity-cache.mjs";
import {
  routeIndexQuery,
  pageIdentitiesQuery,
  documentQuery,
  settingsQuery,
  navbarQuery,
  footerQuery,
  servicesQuery,
  referencesQuery,
  newsQuery,
  faqsQuery,
  redirectsQuery,
  historyQuery,
  referringDocumentsQuery,
} from "./sanity-projections.mjs";
import { annotateOwners } from "./preview-owners.mjs";
import { resolvePreviewSettings } from "./preview-settings.ts";
type Fetcher = typeof fetch;
export type PreviewOptions = { preview?: boolean; stega?: boolean };
type Document = NonNullable<DocumentQueryResult>;
const groupDocuments = (documents: Document[]) => ({
  homePage: documents.find((d) => d._type === "homePage") ?? null,
  pages: documents.filter((d) => d._type === "page"),
  services: documents.filter((d) => d._type === "service"),
  references: documents.filter((d) => d._type === "projectReference"),
  newsPosts: documents.filter((d) => d._type === "newsPost"),
});
type Grouped = ReturnType<typeof groupDocuments>;
type PageData = Omit<Grouped, "services" | "references" | "newsPosts"> & {
  services: Grouped["services"] | ServicesQueryResult;
  references: Grouped["references"] | ReferencesQueryResult;
  newsPosts: Grouped["newsPosts"] | NewsQueryResult;
  settings: SettingsQueryResult;
  navbar: NavbarQueryResult;
  footer: FooterQueryResult;
  faqs: FaqsQueryResult;
  redirects: RedirectsQueryResult;
  historyDestination?: string | null;
};

export async function sanityQuery<const Q extends string>(
  query: Q,
  params: QueryParams = {},
  tags: string[] = [],
  fetcher: Fetcher = fetch,
  noStore = false,
  options: PreviewOptions = {},
): Promise<ClientReturn<Q, unknown>> {
  if (options.preview) {
    const { requestLiveQuery } = await import("./sanity-live.ts");
    return requestLiveQuery(query, params, options.stega ?? true);
  }
  const encoded = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      `$${key}`,
      JSON.stringify(value),
    ]),
  );
  const response = await fetcher(
    queryUrl(query, { ...encoded, perspective: "published" }),
    noStore ? { cache: "no-store" } : { cache: "force-cache", next: { tags } },
  );
  if (!response.ok)
    throw new Error(`Sanity content request failed (${response.status})`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("result" in payload))
    throw new Error("Sanity content response has no result");
  // One network boundary, tied to actual generated named queries; no handwritten CMS result models.
  return payload.result as ClientReturn<Q, unknown>;
}
export async function fetchRouteIndex(fetcher: Fetcher = fetch) {
  const docs = await sanityQuery(routeIndexQuery, {}, [sitemapTag], fetcher);
  return [
    "homePage",
    "page",
    "service",
    "projectReference",
    "newsPost",
  ].flatMap((type) =>
    docs.filter((doc) => doc._type === type && documentPath(doc)),
  );
}
function slugVariants(path: string) {
  try {
    const segments = path
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .map((value) => decodeURIComponent(value));
    const suffixes = segments.map((_, index) =>
      segments.slice(index).join("/"),
    );
    return [
      ...new Set(
        suffixes.flatMap((value) => [
          value,
          `/${value}`,
          `${value}/`,
          `/${value}/`,
        ]),
      ),
    ];
  } catch {
    return [];
  }
}
export async function fetchShellData(
  fetcher: Fetcher = fetch,
  options: PreviewOptions = {},
) {
  const [selectedSettings, navbar, footer] = await Promise.all([
    sanityQuery(
      settingsQuery,
      {},
      [shellTag("settings")],
      fetcher,
      false,
      options,
    ),
    sanityQuery(navbarQuery, {}, [shellTag("navbar")], fetcher, false, options),
    sanityQuery(footerQuery, {}, [shellTag("footer")], fetcher, false, options),
  ]);
  const settings = options.preview
    ? resolvePreviewSettings(
        selectedSettings,
        await sanityQuery(settingsQuery, {}, [shellTag("settings")], fetcher),
      )
    : selectedSettings;
  return options.preview && options.stega !== false
    ? annotateOwners({ settings, navbar, footer })
    : { settings, navbar, footer };
}
export async function fetchPageData(
  rawPath: string,
  fetcher: Fetcher = fetch,
  options: PreviewOptions = {},
): Promise<{ data: PageData; document: Document | null }> {
  const path = normalizePath(rawPath),
    lookupPath = path === "/category/aktuelt/" ? "/aktuelt/" : path;
  const identities = await sanityQuery(
    pageIdentitiesQuery,
    { home: lookupPath === "/", slugs: slugVariants(lookupPath) },
    [routeTag(lookupPath)],
    fetcher,
    false,
    { ...options, stega: false },
  );
  const matching = identities.filter((doc) => documentPath(doc) === lookupPath);
  const [records, shell] = await Promise.all([
    Promise.all(
      matching.map((doc) =>
        sanityQuery(
          documentQuery,
          { id: doc._id },
          [documentTag(doc._id)],
          fetcher,
          false,
          options,
        ),
      ),
    ),
    fetchShellData(fetcher, options),
  ]);
  const data: PageData = {
    ...groupDocuments(records.filter((doc): doc is Document => Boolean(doc))),
    ...shell,
    faqs: [],
    redirects: [],
  };
  const document =
    records.find((doc) => doc && documentPath(doc) === lookupPath) ?? null;
  if (!document) {
    const [redirects, history] = await Promise.all([
      sanityQuery(
        redirectsQuery,
        { from: slugVariants(path) },
        [redirectTag(path)],
        fetcher,
        false,
        options,
      ),
      sanityQuery(
        historyQuery,
        { path },
        [redirectTag(path)],
        fetcher,
        false,
        options,
      ),
    ]);
    data.redirects = redirects;
    data.historyDestination = history ? documentPath(history) : null;
    return { data, document: null };
  }
  await Promise.all(
    collectionTypesForPath(path, document).map(async (type: string) => {
      if (type === "service")
        data.services = await sanityQuery(
          servicesQuery,
          {},
          [collectionTag(type)],
          fetcher,
          false,
          options,
        );
      if (type === "projectReference")
        data.references = await sanityQuery(
          referencesQuery,
          {},
          [collectionTag(type)],
          fetcher,
          false,
          options,
        );
      if (type === "newsPost")
        data.newsPosts = await sanityQuery(
          newsQuery,
          {},
          [collectionTag(type)],
          fetcher,
          false,
          options,
        );
      if (type === "faq")
        data.faqs = await sanityQuery(
          faqsQuery,
          {},
          [collectionTag(type)],
          fetcher,
          false,
          options,
        );
    }),
  );
  return options.preview && options.stega !== false
    ? annotateOwners({ data, document })
    : { data, document };
}
export async function fetchReferringDocuments(
  id: string,
  fetcher: Fetcher = fetch,
) {
  const visited = new Set([id]);
  const documents = new Map<
    string,
    Awaited<ReturnType<typeof getParents>>[number]
  >();
  let pending = [id];
  async function getParents(ids: string[]) {
    return sanityQuery(referringDocumentsQuery, { ids }, [], fetcher, true);
  }
  while (pending.length) {
    const parents = await getParents(pending);
    pending = [];
    for (const parent of parents) {
      if (visited.has(parent._id)) continue;
      visited.add(parent._id);
      documents.set(parent._id, parent);
      pending.push(parent._id);
    }
    if (visited.size > 10000)
      throw new Error("Reference graph exceeds supported size");
  }
  return [...documents.values()];
}
