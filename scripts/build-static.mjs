import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distMirrors = ["dist", "apps/studio/dist"];
const mirrors = ["", "apps/studio", ...distMirrors];
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

function renderFeatureCardMarker(card, index) {
  const svg = typeof card?.icon?.svg === "string" ? card.icon.svg.trim() : "";
  if (svg.startsWith("<svg")) {
    return `<span class="feature-card-icon" aria-hidden="true">${svg}</span>`;
  }

  return `<span class="feature-card-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>`;
}

function serviceIconSvg(service) {
  const cmsSvg = typeof service?.icon?.svg === "string" ? service.icon.svg.trim() : "";
  if (cmsSvg.startsWith("<svg")) return cmsSvg;

  const slug = normalizePath(service?.slug);
  const icons = {
    "/stalbygg/": '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="30" height="30" stroke="currentColor" stroke-width="2.5"/><path d="M9 24h30M24 9v30" stroke="currentColor" stroke-width="2.5"/></svg>',
    "/vegger/": '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 23 24 11l16 12" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M14 22v17h20V22" stroke="currentColor" stroke-width="2.5"/><path d="M18 28h12M18 33h12" stroke="currentColor" stroke-width="2.5"/></svg>',
    "/broer/": '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 30c4-9 10-14 17-14s13 5 17 14" stroke="currentColor" stroke-width="2.5"/><path d="M8 33h32M13 33v5M20 33v5M28 33v5M35 33v5" stroke="currentColor" stroke-width="2.5"/></svg>',
    "/trapper/": '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 36h8v-6h8v-6h8v-6" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M13 17 31 35" stroke="currentColor" stroke-width="2.5"/></svg>',
  };

  return icons[slug] || '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 14h28v20H10z" stroke="currentColor" stroke-width="2.5"/><path d="M10 22h28" stroke="currentColor" stroke-width="2.5"/></svg>';
}

function renderServiceCard(service) {
  return `<a class="service-card" href="${escapeHtml(normalizePath(service.slug))}"><span class="service-icon" aria-hidden="true">${serviceIconSvg(service)}</span><h3>${escapeHtml(pageTitle(service))}</h3><p>${escapeHtml(service.summary || "")}</p></a>`;
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
        return `<section class="section cms-block">${block.eyebrow ? `<p class="eyebrow">${escapeHtml(block.eyebrow)}</p>` : ""}${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}${renderBlocks(block.richText)}<div class="feature-card-grid">${(block.cards || []).map((card, index) => `<article class="feature-card">${renderFeatureCardMarker(card, index)}<h3>${escapeHtml(card.title || "")}</h3>${renderBlocks(card.richText)}</article>`).join("")}</div></section>`;
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
  return `<section class="gallery-section"><h2>Galleri</h2><div class="gallery">${images.map((image) => `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || image.caption || "")}" loading="lazy" decoding="async">`).join("")}</div></section>`;
}

function renderHero(data) {
  const doc = data.document;
  const images = (doc.heroImages || doc.gallery || []).filter((image) => image?.url);
  const services = data.services || [];
  const slides = images.length
    ? `<div class="hero-media" aria-label="Prosjektbilder fra Fiskum Plate og Sveiseverksted">${images
        .map((image, index) => `<figure class="hero-slide ${index === 0 ? "is-active" : ""}"><img ${index === 0 ? `src="${escapeHtml(image.url)}" fetchpriority="high"` : `data-src="${escapeHtml(image.url)}" loading="lazy"`} alt="${escapeHtml(image.alt || image.caption || "")}" decoding="async"></figure>`)
        .join("")}</div>`
    : "";
  const dots = images.length > 1
    ? `<div class="hero-dots" aria-label="Velg hero-bilde">${images.map((_, index) => `<button class="${index === 0 ? "is-active" : ""}" type="button" aria-label="Vis bilde ${index + 1}"></button>`).join("")}</div>`
    : "";
  const strip = services.length
    ? `<div class="hero-strip">${services
        .map((service) => `<a href="${escapeHtml(normalizePath(service.slug))}"><strong>${escapeHtml(pageTitle(service))}</strong><small>${escapeHtml(service.summary || "")}</small></a>`)
        .join("")}</div>`
    : "";
  return `<section class="hero">${slides}<div class="hero-copy"><p class="eyebrow">${escapeHtml(doc.description || "")}</p><h1>${escapeHtml(doc.title || "")}</h1>${doc.heroLead ? `<p>${escapeHtml(doc.heroLead)}</p>` : ""}<div class="hero-actions"><a class="button primary" href="/kontakt-oss/">Send forespørsel</a>${data.settings?.phone ? `<a class="button ghost" href="tel:${escapeHtml(data.settings.phone.replaceAll(" ", ""))}">${escapeHtml(data.settings.phone)}</a>` : ""}</div></div>${dots}${strip}</section>`;
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
  return `<main id="top">${renderHero(data)}${renderBuilder(doc.pageBuilder)}${services.length ? `<section class="section services">${services.map(renderServiceCard).join("")}</section>` : ""}${news.length ? `<section class="section news"><div class="section-heading"><p class="eyebrow">Aktuelt</p><h2>Aktuelt</h2></div><div class="news-grid">${news.slice(0, 2).map(renderNewsCard).join("")}</div><a class="back-link" href="/aktuelt/">Se alle nyheter</a></section>` : ""}${faqs.length ? `<section class="section faq"><div class="section-heading"><p class="eyebrow">FAQ</p><h2>Ofte stilte spørsmål</h2></div>${faqs.map((faq, index) => `<details ${index === 0 ? "open" : ""}><summary>${escapeHtml(faq.title || "")}</summary>${renderBlocks(faq.richText)}</details>`).join("")}</section>` : ""}</main>`;
}

function renderNewsCard(post) {
  return `<a class="news-card" href="${escapeHtml(newsHref(post))}">${post.image?.url ? `<img src="${escapeHtml(post.image.url)}" alt="${escapeHtml(post.image.alt || pageTitle(post))}" loading="lazy" decoding="async">` : ""}<div><p>${escapeHtml(formatDate(post.publishedAt))}</p><h3>${escapeHtml(pageTitle(post))}</h3></div></a>`;
}

function renderSidePanel(data, path) {
  const settings = data.settings;
  if (path === "/tjenester/") {
    return `<aside class="side-panel"><strong>Kontakt</strong>${settings?.phone ? `<a href="tel:${escapeHtml(settings.phone.replaceAll(" ", ""))}">${escapeHtml(settings.phone)}</a>` : ""}${settings?.contactEmail ? `<a href="mailto:${escapeHtml(settings.contactEmail)}">${escapeHtml(settings.contactEmail)}</a>` : ""}</aside>`;
  }
  if (["/stalbygg/", "/vegger/", "/broer/", "/trapper/"].includes(path)) {
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
  const body = [renderBlocks(doc.body), renderBlocks(doc.richText), renderBuilder(doc.pageBuilder), renderGallery(doc.gallery), renderPdfs(doc.pdfFiles), path === "/kontakt-oss/" ? renderContactForm(data.settings) : ""].join("");
  if (path === "/kontakt-oss/") {
    return `<main><section class="page-hero">${breadcrumbHtml(doc, path)}<p class="eyebrow">${escapeHtml(data.settings?.companyName || "")}</p><h1>${escapeHtml(title)}</h1>${lead ? `<p>${escapeHtml(lead)}</p>` : ""}</section><section class="page-content contact-page"><div class="content-stack">${body}</div></section></main>`;
  }
  return `<main><section class="page-hero">${breadcrumbHtml(doc, path)}<p class="eyebrow">${escapeHtml(data.settings?.companyName || "")}</p><h1>${escapeHtml(title)}</h1>${lead ? `<p>${escapeHtml(lead)}</p>` : ""}</section><section class="page-content"><div class="page-grid"><div class="content-stack">${body}</div>${renderSidePanel(data, path)}</div>${renderContextList(data, path)}</section></main>`;
}

function renderContactForm(settings) {
  const email = settings?.contactEmail || "";
  const action = email ? `https://formsubmit.co/${email}` : "";
  return `<section class="contact"><div class="contact-copy"><p class="eyebrow">Kontakt oss</p><h2>Send oss en forespørsel</h2><p>Har du spørsmål, er du alltid velkommen til å ta kontakt med oss.</p></div><form class="contact-form" action="${escapeHtml(action)}" method="POST" aria-label="Kontaktskjema"><input type="hidden" name="_subject" value="Ny forespørsel fra fiskum-sveis.no"><input type="hidden" name="_template" value="table"><input type="hidden" name="_captcha" value="false"><input type="hidden" name="_next" value="/kontakt-oss/"><input type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" class="honeypot"><label>Navn<input type="text" name="name" autocomplete="name" placeholder="Ditt navn" required></label><label>E-post<input type="email" name="email" autocomplete="email" placeholder="din@epost.no" required></label><label>Telefon<input type="tel" name="phone" autocomplete="tel" placeholder="Telefonnummer"></label><label>Hva gjelder det?<select name="topic" required><option>Stålbygg</option><option>Vegger, fasade og tak</option><option>Broer</option><option>Trapper og rekkverk</option><option>Kranutleie</option><option>Annet</option></select></label><label>Beskjed<textarea name="message" rows="5" placeholder="Skriv kort hva du trenger hjelp med" required></textarea></label><button class="button primary" type="submit">Send forespørsel</button></form></section>`;
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
  const sharedFields = `_type, internalTitle, title, description, heroLead, summary, excerpt, publishedAt, icon, "slug": slug.current,
    image{alt, caption, "url": asset->url},
    mainImage{alt, caption, "url": asset->url},
    body[]{..., asset->{url}},
    richText[]{..., asset->{url}},
    gallery[]{alt, caption, "url": asset->url},
    heroImages[]{alt, caption, "url": asset->url},
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

  return issues;
}

function cmsErrorHtml(issues) {
  const title = "Sanity mangler innhold";
  return `<!doctype html>
<html lang="nb">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title}</title>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="cms-error">
      <section class="page-hero">
        <p class="eyebrow">Sanity CMS</p>
        <h1>${title}</h1>
        <p>Nettsiden viser ikke fallback- eller demoinnhold. Fyll Sanity med publisert innhold og bygg/deploy siden på nytt.</p>
      </section>
      <section class="page-content">
        <div class="content-stack">
          <h2>Dette mangler før produksjonsbuild</h2>
          <ul>${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ul>
          <p><a class="button primary" href="/studio/import-fiskum-content">Åpne importverktøy i Sanity Studio</a></p>
        </div>
      </section>
    </main>
  </body>
</html>
`;
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
  for (const mirror of distMirrors) {
    await rm(join(root, mirror), { recursive: true, force: true });
  }
  for (const mirror of mirrors) {
    if (distMirrors.includes(mirror)) continue;
    const base = mirror ? join(root, mirror) : root;
    for (const routeRoot of generatedRoots) {
      await rm(join(base, routeRoot), { recursive: true, force: true });
    }
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prepareDist() {
  const entries = ["styles.css", "script.js", "favicon.ico", "assets", "studio", "static"];
  for (const mirror of distMirrors) {
    const outputRoot = join(root, mirror);
    await mkdir(outputRoot, { recursive: true });
    for (const entry of entries) {
      const source = join(root, entry);
      if (await exists(source)) await cp(source, join(outputRoot, entry), { recursive: true, force: true });
    }
  }
}

async function prepareStudioStaticRoutes() {
  const studioRoutes = ["structure", "import-fiskum-content"];

  for (const mirror of mirrors) {
    const base = mirror ? join(root, mirror) : root;
    const studioIndex = join(base, "studio", "index.html");
    if (!(await exists(studioIndex))) continue;

    for (const route of studioRoutes) {
      const targetDir = join(base, "studio", route);
      await mkdir(targetDir, { recursive: true });
      await cp(studioIndex, join(targetDir, "index.html"), { force: true });
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

  const issues = validateContent(data, documents);
  await cleanGeneratedRoutes();
  await prepareDist();
  await prepareStudioStaticRoutes();

  if (issues.length) {
    const html = cmsErrorHtml(issues);
    await writeRoute("/", html);
    await writeRoute("/studio-import/", html);
    console.warn(`Sanity-innholdet er ikke komplett. Skrev tydelig CMS-feilside uten fallback:\n- ${issues.join("\n- ")}`);
    return;
  }

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
