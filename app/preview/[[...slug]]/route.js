import {
  allDocuments,
  fetchPreviewContent,
  pageHtml,
  routeFor,
  validateContent,
} from "../../../scripts/build-static.mjs";

export const dynamic = "force-dynamic";
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
    .replace("<head>", '<head><meta name="robots" content="noindex,nofollow" />')
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
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

function isAllowedPreviewRequest(request) {
  const referer = request.headers.get("referer") || "";
  if (process.env.NODE_ENV !== "production" && !referer) return true;

  try {
    const requestUrl = new URL(request.url);
    const refererUrl = new URL(referer);
    return refererUrl.origin === requestUrl.origin && refererUrl.pathname.startsWith("/studio");
  } catch {
    return false;
  }
}

export async function GET(request, { params }) {
  if (!isAllowedPreviewRequest(request)) {
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
  } catch (error) {
    return htmlResponse(
      `<!doctype html><html lang="nb"><body style="font-family:Arial,sans-serif;padding:32px"><h1>Preview kunne ikke lastes</h1><p>${String(error?.message || error)}</p></body></html>`,
      500,
    );
  }

  const documents = allDocuments(data);
  const issues = validateContent(data, documents);
  if (issues.length) {
    return htmlResponse(
      `<!doctype html><html lang="nb"><body style="font-family:Arial,sans-serif;padding:32px"><h1>Sanity mangler innhold</h1><ul>${issues.map((issue) => `<li>${issue}</li>`).join("")}</ul></body></html>`,
      422,
    );
  }

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

  return htmlResponse(previewShell(pageHtml({ ...data, document }, routeFor(document))));
}
