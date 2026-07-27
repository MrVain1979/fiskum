import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { parseBody } from "next-sanity/webhook";

function normalizePath(value = "") {
  if (!value || value === "/") return "/";
  const path = value.startsWith("/") ? value : `/${value}`;
  return path.endsWith("/") ? path : `${path}/`;
}

function newsPath(slug, publishedAt) {
  if (!publishedAt) return normalizePath(slug);
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return normalizePath(slug);
  return normalizePath(
    `/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${String(slug || "").replace(/^\/+|\/+$/g, "")}`,
  );
}

function slugValue(slug) {
  if (typeof slug === "string") return slug;
  if (typeof slug?.current === "string") return slug.current;
  return "";
}

function affectedRoutes(body) {
  const slug = slugValue(body?.slug);

  switch (body?._type) {
    case "homePage":
      return ["/", "site-shell"];
    case "page":
      return [normalizePath(slug), "site-shell"];
    case "service":
      return [normalizePath(slug), "/", "/tjenester/", "site-shell"];
    case "projectReference":
      return [normalizePath(`/referanser/${String(slug).replace(/^\/+|\/+$/g, "")}`), "/referanser/", "site-shell"];
    case "newsPost":
      return [newsPath(slug, body.publishedAt), "/", "/aktuelt/", "/category/aktuelt/", "site-shell"];
    case "settings":
    case "navbar":
    case "footer":
      return ["site-shell"];
    case "faq":
      return ["/", "site-shell"];
    default:
      return [];
  }
}

export async function POST(request) {
  const secret = process.env.SANITY_REVALIDATE_SECRET;
  if (!secret) {
    return new Response("Missing SANITY_REVALIDATE_SECRET", { status: 500 });
  }

  const { isValidSignature, body } = await parseBody(request, secret, true);
  if (!isValidSignature) {
    return new Response("Invalid signature", { status: 401 });
  }

  if (!body?._type) {
    return new Response("Missing document type", { status: 400 });
  }

  const routes = affectedRoutes(body);
  const revalidated = [];

  for (const route of routes) {
    if (route === "site-shell") {
      revalidateTag("site-shell");
      revalidated.push("tag:site-shell");
      continue;
    }

    revalidateTag(`route:${route}`);
    revalidatePath(route);
    revalidated.push(route);
  }

  return NextResponse.json({
    ok: true,
    type: body._type,
    revalidated,
  });
}
