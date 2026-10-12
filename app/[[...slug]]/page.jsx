import { notFound, permanentRedirect, redirect } from "next/navigation";

import {
  documentBody,
  findRedirect,
  pageMetadata,
} from "../../scripts/build-static.mjs";
import { fetchPageData, fetchRouteIndex } from "../../lib/sanity-content.mjs";
import { documentPath, normalizePath } from "../../lib/sanity-cache.mjs";

export const dynamic = "force-static";
export const dynamicParams = true;

function pathFromParams(params) {
  const slug = params?.slug || [];
  return normalizePath(slug.length ? `/${slug.join("/")}` : "/");
}

export async function generateStaticParams() {
  const routes = (await fetchRouteIndex())
    .map(documentPath)
    .filter(Boolean);

  if (routes.includes("/aktuelt/")) {
    routes.push("/category/aktuelt/");
  }

  return routes
    .map((route) => ({
      slug: route === "/" ? [] : route.replace(/^\/+|\/+$/g, "").split("/"),
    }));
}

export async function generateMetadata({ params }) {
  const path = pathFromParams(await params);
  const { data, document } = await fetchPageData(path);

  if (!document) {
    return {
      title: data?.settings?.siteTitle || "Fiskum Plate og Sveiseverksted",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return pageMetadata({ ...data, document }, path === "/category/aktuelt/" ? "/aktuelt/" : path);
}

export default async function Page({ params }) {
  const path = pathFromParams(await params);
  const { data, document } = await fetchPageData(path);
  if (!document) {
    const redirectRule = findRedirect(data, path);
    if (redirectRule?.destination) {
      if (redirectRule.permanent) permanentRedirect(redirectRule.destination);
      redirect(redirectRule.destination);
    }
    notFound();
  }

  return (
    <div
      id="site-root"
      className="cms-shell"
      aria-live="polite"
      dangerouslySetInnerHTML={{ __html: documentBody({ ...data, document }, path) }}
    />
  );
}
