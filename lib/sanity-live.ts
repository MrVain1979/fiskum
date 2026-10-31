import "server-only";
import {
  createClient,
  type ClientReturn,
  type QueryParams,
} from "@sanity/client";
import { cookies, draftMode } from "next/headers";
import {
  defineLive,
  resolvePerspectiveFromCookies,
  resolveVariantFromCookies,
} from "next-sanity/live";
export const client = createClient({
  projectId: "qgyys6fw",
  dataset: "production",
  apiVersion: "2025-06-01",
  useCdn: false,
  perspective: "published",
  stega: {
    studioUrl:
      process.env.NEXT_PUBLIC_SANITY_STUDIO_URL ||
      "https://www.fiskum-sveis.no/studio",
  },
});
const token = process.env.SANITY_API_READ_TOKEN || false;
// Native Presentation supplies authenticated draft live updates. Keep the project reader
// server-only: this project also contains the customer's private form Inbox documents.
export const { sanityFetch: liveFetch, SanityLive } = defineLive({
  client,
  serverToken: token,
  browserToken: false,
});
export async function requestLiveQuery<const Q extends string>(
  query: Q,
  params: QueryParams = {},
  stega = true,
): Promise<ClientReturn<Q, unknown>> {
  if (!(await draftMode()).isEnabled)
    throw new Error("Live Preview krever autorisert Draft Mode.");
  if (!token)
    throw new Error(
      "Live Preview krever SANITY_API_READ_TOKEN med kun Viewer-tilgang.",
    );
  const jar = await cookies();
  const perspective = await resolvePerspectiveFromCookies({ cookies: jar });
  const variant = await resolveVariantFromCookies({ cookies: jar });
  return (await liveFetch({ query, params, perspective, variant, stega }))
    .data as ClientReturn<Q, unknown>;
}
