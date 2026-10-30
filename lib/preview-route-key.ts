import "server-only";
import { cookies } from "next/headers";
import { resolvePerspectiveFromCookies } from "next-sanity/live";

// The SDK refreshes RSC after changing perspective. Next preserves a same-path
// 404 boundary, so only that public route subtree must remount when it changes.
export async function previewRouteKey(authorizedDraftMode: boolean) {
  if (!authorizedDraftMode) return "published";
  const perspective = await resolvePerspectiveFromCookies({
    cookies: await cookies(),
  });
  return `preview:${JSON.stringify(perspective)}`;
}
