import {
  allDocuments,
  fetchPreviewContent,
  pageHtml,
  routeFor,
} from "../../../scripts/build-static.mjs";
import { isAuthorizedPreviewRequest, previewHeaders } from "../../../lib/preview-session.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

function normalizePath(value = "") {
  if (!value || value === "/") return "/";
  const path = value.startsWith("/") ? value : `/${value}`;
  return path.endsWith("/") ? path : `${path}/`;
}

function pathFromParams(params) {
  const slug = params?.slug || [];
  return normalizePath(slug.length ? `/${slug.join("/")}` : "/");
}

function cleanDocumentId(value = "") {
  return String(value).replace(/^drafts\./, "");
}

function previewShell(html) {
  return html
    .replace(
      "</body>",
      `<div style="position:fixed;right:16px;bottom:16px;z-index:99999;background:#111;color:#fff;font:700 12px/1.2 Arial,sans-serif;letter-spacing:.02em;padding:10px 12px;border-radius:999px;box-shadow:0 10px 28px rgba(0,0,0,.22)">Sanity draft preview</div></body>`,
    );
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...previewHeaders,
    },
  });
}

export async function GET(request, { params }) {
  let authorized = false;
  try {
    authorized = isAuthorizedPreviewRequest(request);
  } catch {
    return htmlResponse('<!doctype html><html lang="nb"><body><h1>Preview er midlertidig utilgjengelig</h1></body></html>', 503);
  }
  if (!authorized) {
    return htmlResponse(
      '<!doctype html><html lang="nb"><body style="font-family:Arial,sans-serif;padding:32px"><h1>Preview er bare tilgjengelig fra Sanity Studio</h1></body></html>',
      403,
    );
  }

  const path = pathFromParams(await params);
  const url = new URL(request.url);
  const documentId = cleanDocumentId(url.searchParams.get("id") || "");

  let data;
  try {
    data = await fetchPreviewContent();
  } catch {
    return htmlResponse(
      '<!doctype html><html lang="nb"><body style="font-family:Arial,sans-serif;padding:32px"><h1>Preview kunne ikke lastes</h1></body></html>',
      500,
    );
  }

  const documents = allDocuments(data);

  const document =
    (documentId
      ? documents.find((doc) => cleanDocumentId(doc?._id) === documentId)
      : null) ||
    documents.find((doc) => routeFor(doc) === path);

  if (!document) {
    return htmlResponse(
      '<!doctype html><html lang="nb"><body style="font-family:Arial,sans-serif;padding:32px"><h1>Preview fant ikke dokumentet</h1></body></html>',
      404,
    );
  }

  return htmlResponse(previewShell(pageHtml({ ...data, document }, routeFor(document), { preview: true })));
}
