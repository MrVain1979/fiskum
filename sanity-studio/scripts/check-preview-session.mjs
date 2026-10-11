// Run with the existing logged-in Studio CLI:
// sanity exec scripts/check-preview-session.mjs --with-user-token
// Optional PREVIEW_TEST_ORIGIN / PREVIEW_TEST_PATH select a local server or preview document.
// This creates and then deletes only an ephemeral preview-secret document; it never publishes content.
import { randomUUID } from "node:crypto";
import { getCliClient } from "sanity/cli";
import { createPreviewSecret } from "@sanity/preview-url-secret/create-secret";

const origin = new URL(process.env.PREVIEW_TEST_ORIGIN || "https://www.fiskum-sveis.no").origin;
const path = process.env.PREVIEW_TEST_PATH || "/preview/";
if (!path.startsWith("/preview/") || path.startsWith("//")) throw new Error("Invalid preview test path");
const client = getCliClient({ apiVersion: "2025-02-19" }).withConfig({ useCdn: false });
const id = randomUUID();
const headers = { Origin: origin, "Content-Type": "application/json" };
const evidence = { origin, path, passed: false };
let stage = "create temporary preview secret";

try {
  const anonymous = await fetch(`${origin}${path}`, { headers: { Referer: `${origin}/studio/` }, redirect: "manual" });
  evidence.forgedRefererStatus = anonymous.status;
  if (anonymous.status !== 403) throw new Error("Anonymous preview was not rejected");
  const { secret } = await createPreviewSecret(client, "fiskum.studio.preview", `${origin}/studio/`, undefined, id);
  stage = "authorize preview session";
  const session = await fetch(`${origin}/preview/session`, {
    method: "POST", headers, body: JSON.stringify({ secret }), redirect: "manual",
  });
  evidence.authorizeStatus = session.status;
  if (session.status !== 200) throw new Error("Session rejected");
  const cookieHeader = session.headers.get("set-cookie") || "";
  evidence.cookieProtected = /HttpOnly/i.test(cookieHeader) && /SameSite=Strict/i.test(cookieHeader) && /Path=\/preview/i.test(cookieHeader);
  if (!evidence.cookieProtected) throw new Error("Cookie protection missing");
  const cookie = cookieHeader.split(";")[0];
  stage = "render authorized draft preview";
  const preview = await fetch(`${origin}${path}`, { headers: { Cookie: cookie }, redirect: "manual" });
  evidence.previewStatus = preview.status;
  const html = await preview.text();
  evidence.draftPreviewRendered = html.includes("Sanity draft preview");
  evidence.noStore = /no-store/.test(preview.headers.get("cache-control") || "");
  if (preview.status !== 200 || !evidence.draftPreviewRendered || !evidence.noStore) throw new Error("Draft preview failed");
  stage = "reject invalid preview secret";
  const invalid = await fetch(`${origin}/preview/session`, {
    method: "POST", headers, body: JSON.stringify({ secret: "invalid-preview-test-secret-1234567890" }), redirect: "manual",
  });
  evidence.invalidSecretStatus = invalid.status;
  if (invalid.status !== 401) throw new Error("Invalid secret accepted");
  stage = "end preview session";
  const ended = await fetch(`${origin}/preview/session`, { method: "DELETE", headers: { Origin: origin, Cookie: cookie }, redirect: "manual" });
  evidence.endStatus = ended.status;
  evidence.cookieCleared = /Max-Age=0/.test(ended.headers.get("set-cookie") || "");
  if (ended.status !== 200 || !evidence.cookieCleared) throw new Error("Session did not end");
  evidence.passed = true;
} catch {
  evidence.failedStage = stage;
  process.exitCode = 1;
} finally {
  try {
    await client.delete(`drafts.${id}`);
    evidence.temporarySecretRemoved = true;
  } catch {
    evidence.temporarySecretRemoved = false;
    evidence.passed = false;
    process.exitCode = 1;
  }
  // Do not log response bodies, headers, SDK errors, cookie values, or either token.
  console.log(JSON.stringify(evidence));
}
