import { stegaClean } from "@sanity/client/stega";
export const productionOrigin = "https://www.fiskum-sveis.no";
const reserved = [
  "api",
  "studio",
  "preview",
  "_next",
  "assets",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "script.js",
  "styles.css",
];
export type RouteIdentity = {
  _type: string;
  slug?: string | { current?: string } | null;
  publishedAt?: string | null;
};
export function slugParts(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  const raw = stegaClean(value);
  if (!raw || raw !== raw.trim() || /[\\?#\u0000-\u001f\u007f]/u.test(raw))
    return null;
  const parts = raw.replace(/^\//, "").replace(/\/$/, "").split("/");
  if (parts.some((p) => !p || p === "." || p === "..")) return null;
  try {
    parts.forEach((p) => encodeURIComponent(p));
  } catch {
    return null;
  }
  return parts;
}
export function contentPath(
  doc: RouteIdentity | null | undefined,
): string | null {
  if (!doc) return null;
  const type = stegaClean(doc._type);
  if (type === "homePage") return "/";
  const value = typeof doc.slug === "string" ? doc.slug : doc.slug?.current;
  const parts = slugParts(value);
  if (!parts) return null;
  if (["page", "service"].includes(type) && reserved.includes(parts[0]))
    return null;
  const encoded = parts.map((p) => encodeURIComponent(p)).join("/");
  if (type === "projectReference") return `/referanser/${encoded}/`;
  if (type === "newsPost") {
    if (!doc.publishedAt) return null;
    const date = new Date(stegaClean(doc.publishedAt));
    if (!Number.isFinite(date.getTime())) return null;
    return `/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}/${encoded}/`;
  }
  return `/${encoded}/`;
}
export function slugError(value: unknown, type: string): string | null {
  if (type === "homePage")
    return value === "/" ? null : "Forsiden skal ha URL /.";
  const parts = slugParts(value);
  if (!parts || parts.length !== 1)
    return "Bruk ett uenkodet URL-segment, eventuelt med nettstedets etablerte / foran. Fjern mellomrom rundt, kontrolltegn, / inne i segmentet, \\, ? og #.";
  return ["page", "service"].includes(type) && reserved.includes(parts[0])
    ? "Denne URL-en er reservert."
    : null;
}
export function canonicalOverride(value: unknown): {
  url?: string;
  error?: string;
} {
  if (value == null || value === "") return {};
  if (typeof value !== "string") return { error: "Canonical må være en URL." };
  const raw = stegaClean(value).trim();
  if (!raw) return {};
  if (!/^https:\/\//i.test(raw) || /[\\\u0000-\u0020\u007f?#]/u.test(raw))
    return {
      error:
        "Bruk en fullstendig HTTPS-adresse uten query, fragment eller mellomrom.",
    };
  try {
    const url = new URL(raw);
    if (url.origin !== productionOrigin || url.username || url.password)
      return { error: "Bruk produksjonsdomenet https://www.fiskum-sveis.no." };
    const start = raw.indexOf("/", raw.indexOf("://") + 3),
      path = start < 0 ? "/" : raw.slice(start);
    const segments =
      path === "/"
        ? []
        : path
            .replace(/\/$/, "")
            .slice(1)
            .split("/")
            .map((segment) => decodeURIComponent(segment));
    if (
      segments.some(
        (segment) =>
          !segment ||
          /[\u0000-\u001f\u007f/\\?#]/u.test(segment) ||
          segment === "." ||
          segment === "..",
      )
    )
      return { error: "Ugyldig URL-segment." };
    url.pathname = segments.length
      ? `/${segments.map(encodeURIComponent).join("/")}/`
      : "/";
    return { url: url.href };
  } catch {
    return { error: "Bruk en gyldig fullstendig HTTPS-adresse." };
  }
}
