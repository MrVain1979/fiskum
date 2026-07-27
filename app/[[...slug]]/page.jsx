import { notFound } from "next/navigation";

import {
  allDocuments,
  documentBody,
  fetchContent,
  pageLead,
  pageTitle,
  routeFor,
  validateContent,
} from "../../scripts/build-static.mjs";

export const dynamic = "force-static";
export const dynamicParams = true;

function normalizePath(value = "") {
  if (!value || value === "/") return "/";
  const path = value.startsWith("/") ? value : `/${value}`;
  return path.endsWith("/") ? path : `${path}/`;
}

function pathFromParams(params) {
  const slug = params?.slug || [];
  return normalizePath(slug.length ? `/${slug.join("/")}` : "/");
}

function routeTags(path) {
  return [`route:${path}`, "site-shell"];
}

async function getDataForPath(path) {
  const data = await fetchContent(
    {
      cache: "force-cache",
      next: {
        tags: routeTags(path),
      },
    },
    path,
  );
  const documents = allDocuments(data);
  const lookupPath = path === "/category/aktuelt/" ? "/aktuelt/" : path;
  const document = documents.find((doc) => routeFor(doc) === lookupPath);
  return { data, documents, document };
}

export async function generateStaticParams() {
  const data = await fetchContent(
    {
      cache: "force-cache",
      next: {
        tags: ["site-shell"],
      },
    },
    "static-params",
  );

  const routes = allDocuments(data)
    .map((doc) => routeFor(doc))
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
  const { data, document } = await getDataForPath(path);

  if (!document) {
    return {
      title: data?.settings?.siteTitle || "Fiskum Plate og Sveiseverksted",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const title = pageTitle(document) || data.settings?.siteTitle || "";
  const description = pageLead(document) || data.settings?.siteDescription || "";
  const image =
    document?.seoImage?.url ||
    document?.mainImage?.url ||
    document?.image?.url ||
    document?.heroImages?.[0]?.url ||
    document?.gallery?.[0]?.url ||
    "";

  return {
    title: title ? `${title} - ${data.settings?.companyName || ""}` : "",
    description,
    openGraph: {
      title: document?.ogTitle || document?.seoTitle || title,
      description: document?.ogDescription || document?.seoDescription || description,
      images: image ? [image] : [],
    },
    twitter: {
      images: image ? [image] : [],
    },
  };
}

export default async function Page({ params }) {
  const path = pathFromParams(await params);
  const { data, documents, document } = await getDataForPath(path);

  const issues = validateContent(data, documents);
  if (issues.length || !document) notFound();

  return (
    <div
      id="site-root"
      className="cms-shell"
      aria-live="polite"
      dangerouslySetInnerHTML={{ __html: documentBody({ ...data, document }, path) }}
    />
  );
}
