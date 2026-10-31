import { createHash } from "node:crypto";
import { contentPath as routeFor } from "./content-path.ts";

export const routeTypes = [
  "homePage",
  "page",
  "service",
  "projectReference",
  "newsPost",
];
export const shellTypes = ["settings", "navbar", "footer"];
export const supportedTypes = [
  ...routeTypes,
  ...shellTypes,
  "faq",
  "redirect",
  "sanity.imageAsset",
  "sanity.fileAsset",
];
export const publishedFilter = `!(_id in path("drafts.**")) && !(_id in path("versions.**"))`;
const digest = (value) =>
  createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
export const documentTag = (id) => `fiskum:document:${digest(id)}`;
export const routeTag = (path) => `fiskum:route:${digest(normalizePath(path))}`;
export const redirectTag = (path) =>
  `fiskum:redirect:${digest(normalizePath(path))}`;
export const shellTag = (type) => `fiskum:shell:${type}`;
export const collectionTag = (type) => `fiskum:list:${type}`;
export const sitemapTag = "fiskum:route-index";

export function normalizePath(value = "") {
  const path = `/${String(value).replace(/^\/+|\/+$/g, "")}`;
  return path === "/" ? "/" : `${path}/`;
}

export function documentPath(document) {
  if (!document || !routeTypes.includes(document._type)) return null;
  const slug =
    typeof document.slug === "string" ? document.slug : document.slug?.current;
  if (document._type !== "homePage" && !slug) return null;
  return routeFor({ ...document, slug });
}

export function routeAliases(path) {
  return path === "/aktuelt/"
    ? [path, "/category/aktuelt/"]
    : path
      ? [path]
      : [];
}

export function collectionTypesForPath(path, document) {
  const types = new Set();
  if (document?.sidebarVariant === "services") types.add("service");
  for (const section of document?.sections ?? []) {
    if (section.hidden) continue;
    if (
      section._type === "collectionSection" &&
      ["service", "projectReference", "newsPost"].includes(section.collection)
    )
      types.add(section.collection);
    if (
      ["hero", "cta"].includes(section._type) &&
      section.layout === "services"
    )
      types.add("service");
    if (section._type === "heroCarousel" && section.showServices)
      types.add("service");
  }
  return [...types];
}

export function validateWebhookBody(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body._id !== "string" ||
    typeof body._type !== "string"
  ) {
    return { error: "Invalid document identity" };
  }
  if (/^(drafts|versions)\./.test(body._id)) return { ignored: "unpublished" };
  if (!supportedTypes.includes(body._type))
    return { ignored: "unsupported type" };
  if (
    !("before" in body) ||
    !("after" in body) ||
    (!body.before && !body.after)
  )
    return { error: "Expected before and after document identities" };
  for (const state of [body.before, body.after]) {
    if (state === null) continue;
    if (
      !state ||
      typeof state !== "object" ||
      Array.isArray(state) ||
      state._id !== body._id ||
      state._type !== body._type
    )
      return { error: "Invalid before/after identity" };
    for (const key of [
      "slug",
      "publishedAt",
      "from",
      "canonical",
      "parentId",
      "title",
      "navigationTitle",
    ]) {
      if (state[key] != null && typeof state[key] !== "string")
        return { error: `Invalid ${key}` };
    }
    if (state.seoNoIndex != null && typeof state.seoNoIndex !== "boolean")
      return { error: "Invalid seoNoIndex" };
    if (
      state.previousPaths != null &&
      (!Array.isArray(state.previousPaths) ||
        state.previousPaths.some(
          (path) => typeof path !== "string" || path.length > 2048,
        ))
    )
      return { error: "Invalid previousPaths" };
  }
  return { body };
}

function routeIdentity(state) {
  return state ? [state._id, state._type, documentPath(state)] : null;
}

export function identityChanged(before, after) {
  return (
    JSON.stringify(routeIdentity(before)) !==
    JSON.stringify(routeIdentity(after))
  );
}

function hierarchySummaryChanged(before, after) {
  return (
    identityChanged(before, after) ||
    ["parentId", "title", "navigationTitle"].some(
      (field) => (before?.[field] ?? null) !== (after?.[field] ?? null),
    )
  );
}

// The plan is also used by regression tests with the actual data fetcher.
export function invalidationPlan(body, referringDocuments = []) {
  const tags = new Set();
  const paths = new Set();
  if (body._type === "page" && hierarchySummaryChanged(body.before, body.after))
    for (const state of [body.before, body.after])
      if (state?.parentId) tags.add(documentTag(state.parentId));
  const addDocument = (doc) => {
    if (!doc) return;
    tags.add(documentTag(doc._id));
    if (shellTypes.includes(doc._type)) tags.add(shellTag(doc._type));
    if (["service", "projectReference", "newsPost", "faq"].includes(doc._type))
      tags.add(collectionTag(doc._type));
    for (const path of doc.previousPaths ?? []) {
      tags.add(redirectTag(path));
      paths.add(normalizePath(path));
    }
    for (const path of routeAliases(documentPath(doc))) paths.add(path);
    if (doc._type === "redirect" && doc.from) {
      const path = normalizePath(doc.from);
      tags.add(redirectTag(path));
      paths.add(path);
    }
  };
  addDocument(body.before);
  addDocument(body.after);
  for (const doc of referringDocuments) addDocument(doc);
  if (
    routeTypes.includes(body._type) &&
    identityChanged(body.before, body.after)
  ) {
    for (const state of [body.before, body.after]) {
      for (const path of routeAliases(documentPath(state))) {
        tags.add(routeTag(path));
        tags.add(redirectTag(path));
        paths.add(path);
      }
    }
  }
  if (
    routeTypes.includes(body._type) &&
    (identityChanged(body.before, body.after) ||
      Boolean(body.before?.seoNoIndex) !== Boolean(body.after?.seoNoIndex) ||
      (body.before?.canonical ?? null) !== (body.after?.canonical ?? null))
  ) {
    tags.add(sitemapTag);
    paths.add("/sitemap.xml");
  }
  return { tags: [...tags], paths: [...paths] };
}

export function needsReferenceLookup(body) {
  return (
    ["faq", "sanity.imageAsset", "sanity.fileAsset"].includes(body._type) ||
    (body._type === "page" &&
      hierarchySummaryChanged(body.before, body.after)) ||
    (routeTypes.includes(body._type) &&
      identityChanged(body.before, body.after))
  );
}
