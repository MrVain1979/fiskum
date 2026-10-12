import { createHash } from "node:crypto";
import { routeFor } from "../scripts/build-static.mjs";

export const routeTypes = ["homePage", "page", "service", "projectReference", "newsPost"];
export const shellTypes = ["settings", "navbar", "footer"];
export const supportedTypes = [...routeTypes, ...shellTypes, "faq", "redirect", "sanity.imageAsset", "sanity.fileAsset"];
export const publishedFilter = `!(_id in path("drafts.**")) && !(_id in path("versions.**"))`;
const digest = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
export const documentTag = (id) => `fiskum:document:${digest(id)}`;
export const routeTag = (path) => `fiskum:route:${digest(normalizePath(path))}`;
export const redirectTag = (path) => `fiskum:redirect:${digest(normalizePath(path))}`;
export const shellTag = (type) => `fiskum:shell:${type}`;
export const collectionTag = (type) => `fiskum:list:${type}`;
export const sitemapTag = "fiskum:route-index";

export function normalizePath(value = "") {
  const path = `/${String(value).replace(/^\/+|\/+$/g, "")}`;
  return path === "/" ? "/" : `${path}/`;
}

export function documentPath(document) {
  if (!document || !routeTypes.includes(document._type)) return null;
  const slug = typeof document.slug === "string" ? document.slug : document.slug?.current;
  if (document._type !== "homePage" && !slug) return null;
  return routeFor({ ...document, slug });
}

export function routeAliases(path) {
  return path === "/aktuelt/" ? [path, "/category/aktuelt/"] : path ? [path] : [];
}

export function collectionTypesForPath(path, document) {
  if (document?._type === "homePage") return ["service", "newsPost", "faq"];
  if (path === "/tjenester/" || ["/stalbygg/", "/vegger/", "/broer/", "/trapper/"].includes(path)) return ["service"];
  if (path === "/referanser/") return ["projectReference"];
  if (["/aktuelt/", "/category/aktuelt/"].includes(path)) return ["newsPost"];
  return [];
}

export function validateWebhookBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body._id !== "string" || typeof body._type !== "string") {
    return { error: "Invalid document identity" };
  }
  if (/^(drafts|versions)\./.test(body._id)) return { ignored: "unpublished" };
  if (!supportedTypes.includes(body._type)) return { ignored: "unsupported type" };
  if (!("before" in body) || !("after" in body) || (!body.before && !body.after)) return { error: "Expected before and after document identities" };
  for (const state of [body.before, body.after]) {
    if (state === null) continue;
    if (!state || typeof state !== "object" || Array.isArray(state) || state._id !== body._id || state._type !== body._type) return { error: "Invalid before/after identity" };
    for (const key of ["slug", "publishedAt", "from"]) {
      if (state[key] != null && typeof state[key] !== "string") return { error: `Invalid ${key}` };
    }
    if (state.seoNoIndex != null && typeof state.seoNoIndex !== "boolean") return { error: "Invalid seoNoIndex" };
  }
  return { body };
}

function routeIdentity(state) {
  return state ? [state._id, state._type, documentPath(state)] : null;
}

export function identityChanged(before, after) {
  return JSON.stringify(routeIdentity(before)) !== JSON.stringify(routeIdentity(after));
}

// The plan is also used by regression tests with the actual data fetcher.
export function invalidationPlan(body, referringDocuments = []) {
  const tags = new Set();
  const paths = new Set();
  const addDocument = (doc) => {
    if (!doc) return;
    tags.add(documentTag(doc._id));
    if (shellTypes.includes(doc._type)) tags.add(shellTag(doc._type));
    if (["service", "projectReference", "newsPost", "faq"].includes(doc._type)) tags.add(collectionTag(doc._type));
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
  if (routeTypes.includes(body._type) && identityChanged(body.before, body.after)) {
    for (const state of [body.before, body.after]) {
      for (const path of routeAliases(documentPath(state))) {
        tags.add(routeTag(path));
        paths.add(path);
      }
    }
  }
  if (routeTypes.includes(body._type) && (identityChanged(body.before, body.after) || Boolean(body.before?.seoNoIndex) !== Boolean(body.after?.seoNoIndex))) {
    tags.add(sitemapTag);
    paths.add("/sitemap.xml");
  }
  return { tags: [...tags], paths: [...paths] };
}

export function needsReferenceLookup(body) {
  return ["faq", "sanity.imageAsset", "sanity.fileAsset"].includes(body._type) || (routeTypes.includes(body._type) && identityChanged(body.before, body.after));
}
