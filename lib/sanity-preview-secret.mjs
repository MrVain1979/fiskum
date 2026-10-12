import { validatePreviewUrl } from "@sanity/preview-url-secret";
import { PREVIEW_SOURCE } from "./preview-session.mjs";

// client.fetch chooses GET for short queries, even with method: "POST" in its options.
// Use request explicitly so neither this lookup's query nor its secret enters the URL.
async function postQuery(client, query, params, options = {}) {
  const payload = await client.request({
    uri: client.getDataUrl("query"),
    method: "POST",
    body: { query, params },
    json: true,
    useCdn: false,
    returnQuery: false,
    query: { perspective: "raw" },
    tag: options.tag,
    fetch: { cache: "no-store" },
  });
  return payload.result;
}

function postClient(client) {
  return {
    config: () => client.config(),
    withConfig: (config) => postClient(client.withConfig(config)),
    fetch: (query, params, options) => postQuery(client, query, params, options),
  };
}

export async function validateStudioPreviewSecret(client, secret, origin) {
  // This URL is only an in-memory input to Sanity's validator, never a request/redirect/log.
  const url = new URL("/preview/session", origin);
  url.searchParams.set("sanity-preview-secret", secret);
  const result = await validatePreviewUrl(postClient(client), url.toString());
  if (!result.isValid || result.studioOrigin !== origin) return false;
  // Accept only this Studio's temporary secret, never a permanent shared-preview link.
  return await postQuery(client.withConfig({ apiVersion: "2025-02-19", perspective: "raw", useCdn: false }),
    `count(*[_type == "sanity.previewUrlSecret" && _id in path("drafts.**") && secret == $secret && source == $source && studioUrl == $studioUrl && dateTime(_updatedAt) > dateTime(now()) - 3600]) > 0`,
    { secret, source: PREVIEW_SOURCE, studioUrl: `${origin}/studio/` },
    { tag: "fiskum.preview-auth" },
  ) === true;
}
