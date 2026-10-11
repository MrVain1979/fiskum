import { revalidatePath, revalidateTag } from "next/cache";
import { parseBody } from "next-sanity/webhook";
import { invalidationPlan, needsReferenceLookup, validateWebhookBody } from "../../../lib/sanity-cache.mjs";
import { fetchReferringDocuments } from "../../../lib/sanity-content.mjs";

export async function POST(request) {
  const secret = process.env.SANITY_REVALIDATE_SECRET;
  if (!secret) return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  let parsed;
  try {
    // Wait for the webhook mutation to become visible to Content Lake reads.
    parsed = await parseBody(request, secret, true);
  } catch {
    return Response.json({ error: "Invalid webhook" }, { status: 401 });
  }
  if (!parsed.isValidSignature) return Response.json({ error: "Invalid signature" }, { status: 401 });
  const validation = validateWebhookBody(parsed.body);
  if (validation.error) return Response.json({ error: validation.error }, { status: 400 });
  if (validation.ignored) return Response.json({ ok: true, ignored: validation.ignored });
  try {
    const referring = needsReferenceLookup(parsed.body) ? await fetchReferringDocuments(parsed.body._id) : [];
    const plan = invalidationPlan(parsed.body, referring);
    // Next 15 uses the one-argument API; regeneration happens on the next visit.
    for (const tag of plan.tags) revalidateTag(tag);
    for (const path of plan.paths) revalidatePath(path);
    return Response.json({ ok: true, type: parsed.body._type, tags: plan.tags.length, paths: plan.paths });
  } catch {
    // Failed reference lookups must be retried, never acknowledged as success.
    return Response.json({ error: "Content revalidation failed" }, { status: 500 });
  }
}
