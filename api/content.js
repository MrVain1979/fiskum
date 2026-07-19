function readEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

function normalizePath(value = "") {
  if (!value || value === "/") return "/";
  const path = value.startsWith("/") ? value : `/${value}`;
  return path.endsWith("/") ? path : `${path}/`;
}

function slugsFromPath(value = "/") {
  const pathname = normalizePath(value).replace(/\/+$/, "") || "/";
  const segments = pathname.split("/").filter(Boolean);
  const last = segments.at(-1) || "";
  const values = new Set([pathname, `${pathname}/`]);

  if (pathname === "/") values.add("/");
  if (last) {
    values.add(last);
    values.add(`/${last}`);
  }

  return Array.from(values);
}

function contentQuery() {
  return `{
    "settings": *[_type == "settings"][0]{
      companyName, siteTitle, siteDescription, phone, contactEmail, address, socialLinks,
      "logoUrl": logo.asset->url
    },
    "navbar": *[_type == "navbar"][0]{
      columns[]{
        _type, name, title,
        url{type, external, internal->{_type, "slug": slug.current}},
        links[]{name, url{type, external, internal->{_type, "slug": slug.current}}}
      }
    },
    "footer": *[_type == "footer"][0]{
      subtitle,
      columns[]{title, links[]{name, url{type, external, internal->{_type, "slug": slug.current}}}}
    },
    "document": coalesce(
      *[_type == "homePage" && "/" in $slugs][0]{
        _type, title, description, "slug": slug.current,
        pageBuilder[]{
          ...,
          image{alt, caption, "url": asset->url},
          richText[]{..., asset->{url}},
          cards[]{..., image{alt, "url": asset->url}, richText[]{..., asset->{url}}},
          faqs[]->{title, richText[]{..., asset->{url}}},
          buttons[]{text, variant, url{type, external, internal->{_type, "slug": slug.current}}}
        },
        "pdfFiles": pdfFiles[]{title, description, "url": file.asset->url}
      },
      *[$isReferencePath && _type == "projectReference" && slug.current in $slugs][0]{
        _type, internalTitle, title, summary, category, "slug": slug.current,
        body[]{..., asset->{url}},
        gallery[]{alt, caption, "url": asset->url},
        "pdfFiles": pdfFiles[]{title, description, "url": file.asset->url}
      },
      *[$isNewsPath && _type == "newsPost" && slug.current in $slugs][0]{
        _type, internalTitle, title, excerpt, publishedAt, "slug": slug.current,
        mainImage{alt, caption, "url": asset->url},
        body[]{..., asset->{url}},
        "pdfFiles": pdfFiles[]{title, description, "url": file.asset->url}
      },
      *[_type in ["page", "service", "projectReference", "newsPost"] && slug.current in $slugs][0]{
        _type, internalTitle, title, description, summary, excerpt, publishedAt, "slug": slug.current,
        image{alt, caption, "url": asset->url},
        mainImage{alt, caption, "url": asset->url},
        body[]{..., asset->{url}},
        richText[]{..., asset->{url}},
        gallery[]{alt, caption, "url": asset->url},
        pageBuilder[]{
          ...,
          image{alt, caption, "url": asset->url},
          richText[]{..., asset->{url}},
          cards[]{..., image{alt, "url": asset->url}, richText[]{..., asset->{url}}},
          faqs[]->{title, richText[]{..., asset->{url}}},
          buttons[]{text, variant, url{type, external, internal->{_type, "slug": slug.current}}}
        },
        "pdfFiles": pdfFiles[]{title, description, "url": file.asset->url}
      }
    ),
    "services": *[_type == "service"] | order(_createdAt asc){
      title, internalTitle, summary, "slug": slug.current, "image": gallery[0]{alt, "url": asset->url}
    },
    "references": *[_type == "projectReference"] | order(_createdAt asc){
      title, internalTitle, summary, category, "slug": slug.current, "image": gallery[0]{alt, "url": asset->url}
    },
    "newsPosts": *[_type == "newsPost"] | order(publishedAt desc){
      title, internalTitle, excerpt, publishedAt, "slug": slug.current, "image": mainImage{alt, "url": asset->url}
    },
    "faqs": *[_type == "faq"] | order(_createdAt asc){title, richText[]{..., asset->{url}}}
  }`;
}

function queryUrl(query, params) {
  const projectId = readEnv(["SANITY_PROJECT_ID", "SANITY_STUDIO_PROJECT_ID", "NEXT_PUBLIC_SANITY_PROJECT_ID"]);
  const dataset = readEnv(["SANITY_DATASET", "SANITY_STUDIO_DATASET", "NEXT_PUBLIC_SANITY_DATASET"]);
  const apiVersion = readEnv(["SANITY_API_VERSION", "SANITY_STUDIO_API_VERSION", "NEXT_PUBLIC_SANITY_API_VERSION"]);
  const encodedParams = Object.entries(params)
    .map(([key, value]) => `&%24${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`)
    .join("");

  return `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}?query=${encodeURIComponent(query)}${encodedParams}`;
}

module.exports = async function handler(req, res) {
  try {
    const requestUrl = new URL(req.url, "https://fiskum.local");
    const pathname = normalizePath(requestUrl.searchParams.get("path") || "/");
    const response = await fetch(queryUrl(contentQuery(), {
      slugs: slugsFromPath(pathname),
      isReferencePath: pathname.startsWith("/referanser/") && pathname !== "/referanser/",
      isNewsPath: /^\/\d{4}\/\d{2}\/\d{2}\//.test(pathname),
    }));

    if (!response.ok) {
      res.setHeader("Cache-Control", "max-age=0, must-revalidate");
      res.status(response.status).json({ message: `Sanity svarte ${response.status}` });
      return;
    }

    const payload = await response.json();
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.status(200).json(payload);
  } catch (error) {
    res.setHeader("Cache-Control", "max-age=0, must-revalidate");
    res.status(500).json({ message: error instanceof Error ? error.message : "Ukjent Sanity-feil." });
  }
};
