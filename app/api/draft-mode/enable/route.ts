import { defineEnableDraftMode } from "next-sanity/draft-mode";
import { client } from "../../../../lib/sanity-live";
export async function GET(request: Request) {
  const token = process.env.SANITY_API_READ_TOKEN;
  if (!token)
    return new Response("Live Preview mangler Viewer-lesetilgang.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  return defineEnableDraftMode({ client: client.withConfig({ token }) }).GET(
    request,
  );
}
