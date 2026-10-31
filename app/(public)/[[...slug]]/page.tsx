import { draftMode } from "next/headers";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import {
  documentBody,
  findRedirect,
  pageMetadata,
} from "../../../lib/render-content.mjs";
import {
  fetchPageData,
  fetchRouteIndex,
} from "../../../lib/sanity-content.mts";
import { documentPath } from "../../../lib/sanity-cache.mjs";
import { pageJsonLd, serializeJsonLd } from "../../../lib/metadata.mjs";
type Params = Promise<{ slug?: string[] }>;
export const dynamicParams = true;
function routePath(parts: string[] = []) {
  if (
    parts.some(
      (part) =>
        !part ||
        /[\\/\u0000-\u001f\u007f]/u.test(part) ||
        part === "." ||
        part === "..",
    )
  )
    notFound();
  try {
    return parts.length
      ? `/${parts.map((part) => encodeURIComponent(part)).join("/")}/`
      : "/";
  } catch {
    notFound();
  }
}
export async function generateStaticParams() {
  const paths = (await fetchRouteIndex())
    .map(documentPath)
    .filter((path): path is string => Boolean(path));
  if (paths.includes("/aktuelt/")) paths.push("/category/aktuelt/");
  return paths.map((path) => ({
    slug:
      path === "/"
        ? []
        : path
            .replace(/^\/+|\/+$/g, "")
            .split("/")
            .map((part) => decodeURIComponent(part)),
  }));
}
async function pageFor(params: Params, metadata = false) {
  const path = routePath((await params).slug);
  const { isEnabled } = await draftMode();
  const result = await fetchPageData(path, fetch, {
    preview: isEnabled,
    stega: !metadata,
  });
  if (!result.document) {
    const rule = findRedirect(result.data, path);
    if (rule?.destination) {
      if (rule.permanent) permanentRedirect(rule.destination);
      redirect(rule.destination);
    }
    notFound();
  }
  return { ...result, path, preview: isEnabled };
}
export async function generateMetadata({ params }: { params: Params }) {
  const { data, document, path, preview } = await pageFor(params, true);
  return pageMetadata(
    { ...data, document },
    path === "/category/aktuelt/" ? "/aktuelt/" : path,
    { preview },
  );
}
export default async function Page({ params }: { params: Params }) {
  const { data, document, path, preview } = await pageFor(params);
  // JSON-LD follows the selected perspective through an explicit stega:false request.
  const clean = preview ? await pageFor(params, true) : { data, document };
  const structured = pageJsonLd(
    { ...clean.data, document: clean.document },
    path === "/category/aktuelt/" ? "/aktuelt/" : path,
    { preview },
  );
  return (
    <>
      <div
        id="site-root"
        className={`cms-shell${preview ? " cms-preview" : ""}`}
        aria-live="polite"
        dangerouslySetInnerHTML={{
          __html: documentBody({ ...data, document, preview }, path),
        }}
      />
      <script
        id="fiskum-page-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structured) }}
      />
    </>
  );
}
