import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const mirrors = ["", "apps/studio"];
const generatedRoots = [
  "2026",
  "aktuelt",
  "broer",
  "category",
  "kontakt-oss",
  "kranutleie",
  "om-oss",
  "referanser",
  "stalbygg",
  "tjenester",
  "trapper",
  "vegger",
  "verksted",
];

function readEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

function escapeHtml(value = "") {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value = "") {
  return String(value).replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "").trim();
}

function normalizePath(value = "") {
  if (!value || value === "/") return "/";
  if (value.startsWith("http") || value.startsWith("#") || value.startsWith("mailto:") || value.startsWith("tel:")) return value;
  const path = value.startsWith("/") ? value : `/${value}`;
  return path.endsWith("/") ? path : `${path}/`;
}

function resolveLink(url) {
  if (!url) return "";
  if (url.type === "internal") return normalizePath(url.internal?.slug);
  return url.external || url.href || "";
}

function flattenNav(navbar) {
  const items = [];
  (navbar?.columns || []).forEach((item) => {
    if (item?._type === "navbarLink") items.push(item);
    if (Array.isArray(item?.links)) items.push(...item.links);
  });
  return items.filter((item) => item?.name && resolveLink(item.url));
}

function textFromBlocks(blocks = []) {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((block) => block?._type === "block")
    .map((block) => (block.children || []).map((child) => child.text || "").join(""))
    .join(" ")
    .trim();
}

function renderBlocks(blocks = []) {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((block) => {
      if (block?._type === "image" || block?._type === "imageWithAlt") {
        if (!block.url && !block.asset?.url) return "";
        const url = block.url || block.asset.url;
        const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
        return `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(block.alt || block.caption || "")}" loading="lazy" decoding="async">${caption}</figure>`;
      }
      if (block?._type !== "block") return "";

      const html = (block.children || [])
        .map((child) => {
          let value = escapeHtml(child.text || "");
          const marks = child.marks || [];
          if (marks.includes("strong")) value = `<strong>${value}</strong>`;
          if (marks.includes("em")) value = `<em>${value}</em>`;
          return value;
        })
        .join("");

      if (!html) return "";
      if (block.listItem) return `<li>${html}</li>`;
      if (["h2", "h3", "h4"].includes(block.style || "")) return `<${block.style}>${html}</${block.style}>`;
      return `<p>${html}</p>`;
    })
    .join("");
}

function renderButtons(buttons = []) {
  if (!Array.isArray(buttons) || !buttons.length) return "";
  return `<div class="cms-buttons">${buttons
    .filter((button) => button?.text && resolveLink(button.url))
    .map((button) => `<a class="button ${button.variant === "outline" ? "ghost" : "primary"}" href="${escapeHtml(resolveLink(button.url))}">${escapeHtml(button.text)}</a>`)
    .join("")}</div>`;
}

function renderImageCard(card) {
  const href = resolveLink(card.url);
  if (!href) return "";
  const image = card.image?.url ? `<img src="${escapeHtml(card.image.url)}" alt="${escapeHtml(card.image.alt || card.title || "")}" loading="lazy" decoding="async">` : "";
  return `<a class="page-card" href="${escapeHtml(href)}">${image}<h3>${escapeHtml(card.title || "")}</h3><p>${escapeHtml(card.description || "")}</p></a>`;
}

function renderBuilder(blocks = []) {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((block) => {
      if (!block?._type) return "";
      if (block._type === "hero" || block._type === "cta") {
        return `<section class="section cms-block">${block.eyebrow || block.badge ? `<p class="eyebrow">${escapeHtml(block.eyebrow || block.badge)}</p>` : ""}${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}${renderBlocks(block.richText)}${renderButtons(block.buttons)}</section>`;
      }
      if (block._type === "featureCardsIcon") {
        return `<section class="section cms-block">${block.eyebrow ? `<p class="eyebrow">${escapeHtml(block.eyebrow)}</p>` : ""}${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}${renderBlocks(block.richText)}<div class="page-cards">${(block.cards || []).map((card) => `<article class="page-card"><h3>${escapeHtml(card.title || "")}</h3>${renderBlocks(card.richText)}</article>`).join("")}</div></section>`;
      }
      if (block._type === "imageLinkCards") {
        return `<section class="section cms-block">${block.eyebrow ? `<p class="eyebrow">${escapeHtml(block.eyebrow)}</p>` : ""}${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}${renderBlocks(block.richText)}<div class="page-cards">${(block.cards || []).map(renderImageCard).join("")}</div></section>`;
      }
      if (block._type === "faqAccordion") {
        return `<section class="section faq cms-block">${block.eyebrow ? `<p class="eyebrow">${escapeHtml(block.eyebrow)}</p>` : ""}${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}${(block.faqs || []).map((faq, index) => `<details ${index === 0 ? "open" : ""}><summary>${escapeHtml(faq.title || "")}</summary>${renderBlocks(faq.richText)}</details>`).join("")}</section>`;
      }
      return "";
    })
    .join("");
}

function renderGallery(gallery = []) {
  const images = (gallery || []).filter((image) => image?.url);
  if (!images.length) return "";
  return `<div class="gallery">${images.map((image) => `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || image.caption || "")}" loading="lazy" decoding="async">`).join("")}</div>`;
}

function renderPdfs(pdfFiles = []) {
  const files = (pdfFiles || []).filter((file) => file?.url);
  if (!files.length) return "";
  return `<section class="pdf-downloads is-visible" aria-label="PDF-dokumenter"><h2>Dokumenter</h2><div class="pdf-download-list">${files
    .map((file) => `<a class="pdf-download" href="${escapeHtml(file.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(file.title || "")}</strong>${file.description ? `<span>${escapeHtml(file.description)}</span>` : ""}</a>`)
    .join("")}</div></section>`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function newsHref(post) {
  const slug = String(post.slug || "").replace(/^\/+|\/+$/g, "");
  if (!post.publishedAt) return normalizePath(slug);
  const date = new Date(post.publishedAt);
  if (Number.isNaN(date.getTime())) return normalizePath(slug);
  return `/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${slug}/`;
}

function pageTitle(doc) {
  return doc?.title || doc?.internalTitle || "";
}

function pageLead(doc) {
  return doc?.description || doc?.summary || doc?.excerpt || textFromBlocks(doc?.body) || textFromBlocks(doc?.richText);
}

function breadcrumbHtml(doc, path) {
  const title = pageTitle(doc);
  const isNews = doc?._type === "newsPost";
  const isReference = doc?._type === "projectReference";
  if (path === "/") return "";
  return `<nav class="breadcrumbs" aria-label="Brødsmulesti"><a href="/">Forsiden</a>${isNews ? '<span class="breadcrumb-separator" aria-hidden="true">/</span><a href="/aktuelt/">Aktuelt</a>' : ""}${isReference ? '<span class="breadcrumb-separator" aria-hidden="true">/</span><a href="/referanser/">Referanser</a>' : ""}<span class="breadcrumb-separator" aria-hidden="true">/</span><span aria-current="page">${escapeHtml(title)}</span></nav>`;
}

function renderHeader(settings, navbar) {
  const links = flattenNav(navbar);
  return `<header class="site-header"><a class="brand" href="/" aria-label="Til forsiden">${settings?.logoUrl ? `<img src="${escapeHtml(settings.logoUrl)}" alt="${escapeHtml(settings.companyName || "")}">` : ""}<span>${escapeHtml(settings?.companyName || "")}</span></a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-nav"><span></span><span></span><span></span><span class="sr-only">Meny</span></button><nav id="primary-nav" class="nav" aria-label="Hovedmeny">${links.map((item) => `<a${/kontakt/i.test(item.name) ? ' class="nav-cta"' : ""} href="${escapeHtml(resolveLink(item.url))}">${escapeHtml(item.name)}</a>`).join("")}</nav></header>`;
}

function renderFooter(settings, footer, navbar) {
  const links = flattenNav(navbar);
  const phoneHref = (settings?.phone || "").replaceAll(" ", "");
  return `<footer class="footer"><div class="footer-inner"><div class="footer-brand">${settings?.logoUrl ? `<img src="${escapeHtml(settings.logoUrl)}" alt="${escapeHtml(settings.companyName || "")}">` : ""}${footer?.subtitle ? `<h2>${escapeHtml(footer.subtitle)}</h2>` : ""}</div><div class="footer-columns"><div><strong>Telefon</strong>${settings?.phone ? `<a href="tel:${escapeHtml(phoneHref)}">${escapeHtml(settings.phone)}</a>` : ""}</div><div><strong>E-post</strong>${settings?.contactEmail ? `<a href="mailto:${escapeHtml(settings.contactEmail)}">${escapeHtml(settings.contactEmail)}</a>` : ""}</div><address><strong>Adresse</strong>${escapeHtml(settings?.address?.street || "")}<br>${escapeHtml([settings?.address?.postalCode, settings?.address?.city].filter(Boolean).join(" "))}<br>${escapeHtml(settings?.address?.country || "")}</address><div><strong>Følg oss</strong>${settings?.socialLinks?.facebook ? `<a class="social-link" href="${escapeHtml(settings.socialLinks.facebook)}" aria-label="Facebook">f</a>` : ""}</div></div><div class="footer-bottom"><nav aria-label="Bunnmeny">${links.map((item) => `<a href="${escapeHtml(resolveLink(item.url))}">${escapeHtml(item.name)}</a>`).join("")}</nav><p class="copyright">© ${new Date().getFullYear()} ${escapeHtml(settings?.companyName || "")}</p></div></div></footer>`;
}

function renderHome(data) {
  const doc = data.document;
  const services = data.services || [];
  const news = data.newsPosts || [];
  const faqs = data.faqs || [];
  return `<main id="top"><section class="hero"><div class="hero-copy"><p class="eyebrow">${escapeHtml(doc.description || "")}</p><h1>${escapeHtml(doc.title || "")}</h1></div></section>${renderBuilder(doc.pageBuilder)}${services.length ? `<section class="section services">${services.map((service) => `<article>${service.image?.url ? `<img src="${escapeHtml(service.image.url)}" alt="${escapeHtml(service.image.alt || "")}" loading="lazy" decoding="async">` : ""}<h3>${escapeHtml(pageTitle(service))}</h3><p>${escapeHtml(service.summary || "")}</p></article>`).join("")}</section>` : ""}${news.length ? `<section class="section news"><div class="section-heading"><p class="eyebrow">Aktuelt</p><h2>Aktuelt</h2></div><div class="news-grid">${news.slice(0, 2).map(renderNewsCard).join("")}</div><a class="back-link" href="/aktuelt/">Se alle nyheter</a></section>` : ""}${faqs.length ? `<section class="section faq"><div class="section-heading"><p class="eyebrow">FAQ</p><h2>Ofte stilte spørsmål</h2></div>${faqs.map((faq, index) => `<details ${index === 0 ? "open" : ""}><summary>${escapeHtml(faq.title || "")}</summary>${renderBlocks(faq.richText)}</details>`).join("")}</section>` : ""}</main>`;
}

function renderNewsCard(post) {
  return `<a class="news-card" href="${escapeHtml(newsHref(post))}">${post.image?.url ? `<img src="${escapeHtml(post.image.url)}" alt="${escapeHtml(post.image.alt || pageTitle(post))}" loading="lazy" decoding="async">` : ""}<div><p>${escapeHtml(formatDate(post.publishedAt))}</p><h3>${escapeHtml(pageTitle(post))}</h3></div></a>`;
}

function renderSidePanel(data, path) {
  const settings = data.settings;
  if (path.startsWith("/tjenester")) {
    return `<aside class="side-panel"><strong>Tjenester</strong>${(data.services || []).map((service) => `<a href="${escapeHtml(normalizePath(service.slug))}">${escapeHtml(pageTitle(service))}</a>`).join("")}</aside>`;
  }
  return `<aside class="side-panel"><strong>Kontakt</strong>${settings?.phone ? `<a href="tel:${escapeHtml(settings.phone.replaceAll(" ", ""))}">${escapeHtml(settings.phone)}</a>` : ""}${settings?.contactEmail ? `<a href="mailto:${escapeHtml(settings.contactEmail)}">${escapeHtml(settings.contactEmail)}</a>` : ""}</aside>`;
}

function renderContextList(data, path) {
  if (path === "/tjenester/") {
    return `<div class="page-cards">${(data.services || []).map((service) => `<a class="page-card" href="${escapeHtml(normalizePath(service.slug))}"><h3>${escapeHtml(pageTitle(service))}</h3><p>${escapeHtml(service.summary || "")}</p></a>`).join("")}</div>`;
  }
  if (path === "/referanser/") {
    return `<div class="reference-list">${(data.references || []).map((reference) => `<a class="reference-card" href="/referanser/${escapeHtml(String(reference.slug || "").replace(/^\/+|\/+$/g, ""))}/">${reference.image?.url ? `<img src="${escapeHtml(reference.image.url)}" alt="${escapeHtml(reference.image.alt || pageTitle(reference))}" loading="lazy" decoding="async">` : ""}<span>Referanse</span><h3>${escapeHtml(pageTitle(reference))}</h3><p>${escapeHtml(reference.summary || "")}</p></a>`).join("")}</div>`;
  }
  if (path === "/aktuelt/" || path === "/category/aktuelt/") {
    return `<div class="news-list">${(data.newsPosts || []).map((post) => `<a class="news-list-item" href="${escapeHtml(newsHref(post))}"><span>${escapeHtml(formatDate(post.publishedAt))}</span><h2>${escapeHtml(pageTitle(post))}</h2><p>${escapeHtml(post.excerpt || "")}</p></a>`).join("")}</div>`;
  }
  return "";
}

function renderPage(data, path) {
  const doc = data.document;
  const title = pageTitle(doc);
  const lead = pageLead(doc);
  const body = [renderBlocks(doc.body), renderBlocks(doc.richText), renderBuilder(doc.pageBuilder), renderGallery(doc.gallery), renderPdfs(doc.pdfFiles)].join("");
  return `<main><section class="page-hero">${breadcrumbHtml(doc, path)}<p class="eyebrow">${escapeHtml(data.settings?.companyName || "")}</p><h1>${escapeHtml(title)}</h1>${lead ? `<p>${escapeHtml(lead)}</p>` : ""}</section><section class="page-content"><div class="page-grid"><div class="content-stack">${body}</div>${renderSidePanel(data, path)}</div>${renderContextList(data, path)}</section></main>`;
}

function pageHtml(data, path) {
  const doc = data.document;
  const title = pageTitle(doc) || data.settings?.siteTitle || "";
  const description = pageLead(doc) || data.settings?.siteDescription || "";
  const body = `${renderHeader(data.settings, data.navbar)}${doc._type === "homePage" ? renderHome(data) : renderPage(data, path)}${renderFooter(data.settings, data.footer, data.navbar)}`;
  return `<!doctype html>
<html lang="nb">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title ? `${title} - ${data.settings?.companyName || ""}` : "")}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="stylesheet" href="/styles.css" />
    <script src="/script.js" defer></script>
  </head>
  <body>
    <div id="site-root" class="cms-shell" aria-live="polite">
      ${body}
    </div>
  </body>
</html>
`;
}

function contentQuery() {
  const sharedFields = `_type, internalTitle, title, description, summary, excerpt, publishedAt, "slug": slug.current,
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
      buttons[]{text, variant, url{type, external, href, internal->{_type, "slug": slug.current}}}
    },
    "pdfFiles": pdfFiles[]{title, description, "url": file.asset->url}`;
  return `{
    "settings": *[_type == "settings"][0]{companyName, siteTitle, siteDescription, phone, contactEmail, address, socialLinks, "logoUrl": logo.asset->url},
    "navbar": *[_type == "navbar"][0]{columns[]{_type, name, title, url{type, external, href, internal->{_type, "slug": slug.current}}, links[]{name, url{type, external, href, internal->{_type, "slug": slug.current}}}}},
    "footer": *[_type == "footer"][0]{subtitle, columns[]{title, links[]{name, url{type, external, href, internal->{_type, "slug": slug.current}}}}},
    "homePage": *[_type == "homePage"][0]{${sharedFields}},
    "pages": *[_type == "page"] | order(_createdAt asc){${sharedFields}},
    "services": *[_type == "service"] | order(_createdAt asc){${sharedFields}, "image": gallery[0]{alt, "url": asset->url}},
    "references": *[_type == "projectReference"] | order(_createdAt asc){${sharedFields}, category, "image": gallery[0]{alt, "url": asset->url}},
    "newsPosts": *[_type == "newsPost"] | order(publishedAt desc){${sharedFields}, "image": mainImage{alt, "url": asset->url}},
    "faqs": *[_type == "faq"] | order(_createdAt asc){title, richText[]{..., asset->{url}}}
  }`;
}

function queryUrl(query) {
  const projectId = readEnv(["SANITY_PROJECT_ID", "SANITY_STUDIO_PROJECT_ID", "NEXT_PUBLIC_SANITY_PROJECT_ID"]);
  const dataset = readEnv(["SANITY_DATASET", "SANITY_STUDIO_DATASET", "NEXT_PUBLIC_SANITY_DATASET"]);
  const apiVersion = readEnv(["SANITY_API_VERSION", "SANITY_STUDIO_API_VERSION", "NEXT_PUBLIC_SANITY_API_VERSION"]);
  return `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}?query=${encodeURIComponent(query)}`;
}

function routeFor(doc) {
  if (doc._type === "homePage") return "/";
  if (doc._type === "projectReference") return normalizePath(`/referanser/${String(doc.slug || "").replace(/^\/+|\/+$/g, "")}`);
  if (doc._type === "newsPost") return newsHref(doc);
  return normalizePath(doc.slug);
}

function validateContent(data, documents) {
  const routes = new Set(documents.map(routeFor).filter(Boolean));
  const requiredRoutes = ["/", "/om-oss/", "/tjenester/", "/verksted/", "/referanser/", "/aktuelt/", "/kontakt-oss/", "/kranutleie/", "/stalbygg/", "/vegger/", "/broer/", "/trapper/"];
  const missingRoutes = requiredRoutes.filter((route) => !routes.has(route));
  const issues = [];

  if (!data?.settings) issues.push("Mangler Site Settings i Sanity.");
  if (!data?.navbar) issues.push("Mangler Header og hovedmeny i Sanity.");
  if (!data?.footer) issues.push("Mangler Footer i Sanity.");
  if (!data?.homePage) issues.push("Mangler publisert forside i Sanity.");
  if ((data?.services || []).length < 4) issues.push(`Mangler tjeneste-dokumenter i Sanity. Fant ${(data?.services || []).length}, forventet minst 4.`);
  if ((data?.references || []).length < 4) issues.push(`Mangler referanse-dokumenter i Sanity. Fant ${(data?.references || []).length}, forventet minst 4.`);
  if ((data?.newsPosts || []).length < 1) issues.push("Mangler nyheter/Aktuelt i Sanity.");
  if (missingRoutes.length) issues.push(`Mangler publiserte ruter i Sanity: ${missingRoutes.join(", ")}`);

  if (issues.length) {
    throw new Error(`Sanity-innholdet er ikke komplett nok til statisk produksjonsbuild.\n- ${issues.join("\n- ")}`);
  }
}

function fileForRoute(route, mirror) {
  const base = mirror ? join(root, mirror) : root;
  if (route === "/") return join(base, "index.html");
  return join(base, route.replace(/^\/+|\/+$/g, ""), "index.html");
}

async function writeRoute(route, html) {
  for (const mirror of mirrors) {
    const file = fileForRoute(route, mirror);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html, "utf8");
  }
}

async function cleanGeneratedRoutes() {
  for (const mirror of mirrors) {
    const base = mirror ? join(root, mirror) : root;
    for (const routeRoot of generatedRoots) {
      await rm(join(base, routeRoot), { recursive: true, force: true });
    }
  }
}

async function build() {
  const response = await fetch(queryUrl(contentQuery()));
  if (!response.ok) throw new Error(`Sanity svarte ${response.status} under build.`);
  const payload = await response.json();
  const data = payload.result;
  const documents = [
    data.homePage,
    ...(data.pages || []),
    ...(data.services || []),
    ...(data.references || []),
    ...(data.newsPosts || []),
  ].filter(Boolean);

  validateContent(data, documents);
  await cleanGeneratedRoutes();

  const routes = new Set();

  for (const document of documents) {
    const route = routeFor(document);
    if (!route || routes.has(route)) continue;
    routes.add(route);
    await writeRoute(route, pageHtml({ ...data, document }, route));
  }

  const aktuelt = documents.find((doc) => routeFor(doc) === "/aktuelt/");
  if (aktuelt) await writeRoute("/category/aktuelt/", pageHtml({ ...data, document: aktuelt }, "/category/aktuelt/"));

  console.log(`Generated ${routes.size} Sanity-backed routes.`);
}

await build();
