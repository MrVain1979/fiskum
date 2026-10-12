import { allDocuments, queryUrl } from "../scripts/build-static.mjs";
import { collectionTag, collectionTypesForPath, documentPath, documentTag, normalizePath, publishedFilter, redirectTag, routeTag, routeTypes, shellTag, sitemapTag } from "./sanity-cache.mjs";
import { documentProjection, faqProjection, footerProjection, identityProjection, imageProjection, navbarProjection, redirectProjection, settingsProjection } from "./sanity-projections.mjs";

const collectionKeys = { service: "services", projectReference: "references", newsPost: "newsPosts", faq: "faqs" };
const shellProjections = { settings: settingsProjection, navbar: navbarProjection, footer: footerProjection };
const cardFields = `_id, _type, title, internalTitle, summary, excerpt, icon, publishedAt, "slug": slug.current`;
const listProjections = {
  service: cardFields,
  projectReference: `${cardFields}, "image": gallery[0]{${imageProjection}}`,
  newsPost: `${cardFields}, "image": mainImage{${imageProjection}}`,
  faq: faqProjection,
};

export async function sanityQuery(query, params = {}, tags = [], fetcher = fetch, noStore = false) {
  const encoded = Object.fromEntries(Object.entries(params).map(([key, value]) => [`$${key}`, JSON.stringify(value)]));
  const response = await fetcher(queryUrl(query, { ...encoded, perspective: "published" }), noStore
    ? { cache: "no-store" }
    : { cache: "force-cache", next: { tags } });
  if (!response.ok) throw new Error(`Sanity content request failed (${response.status})`);
  const payload = await response.json();
  if (!("result" in payload)) throw new Error("Sanity content response has no result");
  return payload.result;
}

function groupDocuments(documents) {
  return {
    homePage: documents.find((doc) => doc._type === "homePage") || null,
    pages: documents.filter((doc) => doc._type === "page"),
    services: documents.filter((doc) => doc._type === "service"),
    references: documents.filter((doc) => doc._type === "projectReference"),
    newsPosts: documents.filter((doc) => doc._type === "newsPost"),
  };
}

export async function fetchRouteIndex(fetcher = fetch) {
  const documents = await sanityQuery(`*[_type in $types && ${publishedFilter}] | order(_createdAt asc){${identityProjection}}`, { types: routeTypes }, [sitemapTag], fetcher);
  return allDocuments(groupDocuments(documents.filter((doc) => documentPath(doc))));
}

function slugVariants(path) {
  const slug = path.replace(/^\/+|\/+$/g, "");
  const segments = slug.split("/");
  // Slugs can contain '/': retain suffixes after the reference/date prefix too.
  // The exact documentPath check below rejects candidates from other routes.
  const suffixes = segments.map((_, index) => segments.slice(index).join("/"));
  return [...new Set(suffixes.flatMap((value) => [value, `/${value}`, `${value}/`, `/${value}/`]))];
}

export async function fetchPageData(rawPath, fetcher = fetch) {
  const path = normalizePath(rawPath);
  const lookupPath = path === "/category/aktuelt/" ? "/aktuelt/" : path;
  const identities = await sanityQuery(`*[_type in $types && ${publishedFilter} && ((_type == "homePage" && $home) || (_type != "homePage" && slug.current in $slugs))] | order(_createdAt asc){${identityProjection}}`,
    { types: routeTypes, home: lookupPath === "/", slugs: slugVariants(lookupPath) }, [routeTag(lookupPath)], fetcher);
  const matching = identities.filter((doc) => documentPath(doc) === lookupPath);
  const [documents, shell] = await Promise.all([
    Promise.all(matching.map((doc) => sanityQuery(`*[_id == $id && ${publishedFilter}][0]{${documentProjection}}`, { id: doc._id }, [documentTag(doc._id)], fetcher))),
    Promise.all(Object.entries(shellProjections).map(async ([type, projection]) => [type, await sanityQuery(`*[_type == $type && ${publishedFilter}][0]{${projection}}`, { type }, [shellTag(type)], fetcher)])),
  ]);
  const data = { ...groupDocuments(documents.filter(Boolean)), ...Object.fromEntries(shell), faqs: [], redirects: [] };
  const document = allDocuments(data).find((doc) => documentPath(doc) === lookupPath);
  if (!document) {
    data.redirects = await sanityQuery(`*[_type == "redirect" && ${publishedFilter} && from in $from] | order(_createdAt asc){${redirectProjection}}`, { from: slugVariants(path) }, [redirectTag(path)], fetcher);
    return { data, document: null };
  }
  await Promise.all(collectionTypesForPath(path, document).map(async (type) => {
    const order = type === "newsPost" ? "publishedAt desc" : "_createdAt asc";
    data[collectionKeys[type]] = await sanityQuery(`*[_type == $type && ${publishedFilter}] | order(${order}){${listProjections[type]}}`, { type }, [collectionTag(type)], fetcher);
  }));
  return { data, document };
}

// Published references are inspected only for URL identity, FAQ or asset changes.
// Follow transitive references so an asset in a referenced FAQ reaches its pages.
export async function fetchReferringDocuments(id, fetcher = fetch) {
  const visited = new Set([id]);
  const documents = new Map();
  let pending = [id];
  while (pending.length) {
    const parents = await sanityQuery(`*[${publishedFilter} && references($ids)]{${identityProjection}, from}`, { ids: pending }, [], fetcher, true);
    pending = [];
    for (const parent of parents) {
      if (visited.has(parent._id)) continue;
      visited.add(parent._id);
      documents.set(parent._id, parent);
      pending.push(parent._id);
    }
    if (visited.size > 10000) throw new Error("Reference graph exceeds supported size");
  }
  return [...documents.values()];
}
