import { productionOrigin } from "../../../../lib/content-path";
export async function GET(request: Request) {
  const fallback =
    process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : productionOrigin;
  const origin = new URL(process.env.FRONTEND_ORIGIN || fallback).origin;
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
    new URL(request.url).origin !== origin ||
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
