import { productionOrigin } from "../../../../lib/content-path";
export async function GET(request: Request) {
  const fallback =
    process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : productionOrigin;
  const requestUrlOrigin = new URL(request.url).origin;
  // Trust only Vercel's exact deployment/branch names, never a request Host header.
  const previewOrigins =
    process.env.VERCEL_ENV === "preview" && !process.env.FRONTEND_ORIGIN
      ? [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
          .filter((host): host is string => /^[a-z0-9-]+\.vercel\.app$/i.test(host || ""))
          .map((host) => new URL(`https://${host}`).origin)
      : [];
  const origin = previewOrigins.includes(requestUrlOrigin)
    ? requestUrlOrigin
    : new URL(process.env.FRONTEND_ORIGIN || fallback).origin;
  let referer: string | undefined;
  try {
    const value = request.headers.get("referer");
    referer = value ? new URL(value).origin : undefined;
  } catch {
    return new Response("Ugyldig origin.", { status: 403 });
  }
  const requestOrigin = request.headers.get("origin");
  if (
    referer !== origin ||
    requestUrlOrigin !== origin ||
    (requestOrigin && requestOrigin !== origin)
  )
    return new Response("Ugyldig origin.", { status: 403 });
  const headers = new Headers({
    Location: new URL("/", origin).href,
    "Cache-Control": "no-store",
  });
  const secure = origin.startsWith("https:");
  // Raw headers preserve ordinary and CHIPS variants. Mutable Next cookies deduplicate by name.
  for (const name of [
    "__prerender_bypass",
    "sanity-preview-perspective",
    "sanity-preview-variant",
    "sanity-preview-partitioned",
  ]) {
    const expiry = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly`;
    headers.append(
      "Set-Cookie",
      `${expiry}; SameSite=Lax${secure ? "; Secure" : ""}`,
    );
    headers.append(
      "Set-Cookie",
      `${expiry}; SameSite=None; Secure; Partitioned`,
    );
  }
  return new Response(null, { status: 303, headers });
}
