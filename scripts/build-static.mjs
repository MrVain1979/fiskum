import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const productionOrigin = "https://www.fiskum-sveis.no";
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
  throw new Error(
    `Missing required environment variable: ${names.join(" or ")}`,
  );
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
  return String(value)
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .trim();
}

function normalizePath(value = "") {
  if (!value || value === "/") return "/";
  if (
    value.startsWith("http") ||
    value.startsWith("#") ||
    value.startsWith("mailto:") ||
    value.startsWith("tel:")
  )
    return value;
  const path = value.startsWith("/") ? value : `/${value}`;
  return path.endsWith("/") ? path : `${path}/`;
}

function resolveLink(url) {
  if (!url) return "";
  if (url.type === "internal") return routeFor(url.internal || {});
  return url.external || url.href || "";
}

export function findRedirect(data, path) {
  const source = normalizePath(path);
  const redirect = (data?.redirects || []).find(
    (item) => normalizePath(item.from) === source,
  );
  if (!redirect) return null;

  const destination = resolveLink(redirect.to);
  if (!destination || destination === source) return null;

  return {
    destination,
    permanent: redirect.permanent !== false,
  };
}

function imageSource(image) {
  return image?.url || image?.asset?.url || "";
}

function imageDimensions(image) {
  return (
    image?.asset?.metadata?.dimensions || image?.metadata?.dimensions || {}
  );
}

function imageUrl(image) {
  const url = imageSource(image);
  if (!url) return "";
  const crop = image?.crop;
  const { width, height } = imageDimensions(image);
  if (!crop || !width || !height) return url;

  const left = Math.max(0, Math.round(width * (crop.left || 0)));
  const top = Math.max(0, Math.round(height * (crop.top || 0)));
  const rectWidth = Math.max(
    1,
    Math.round(width * (1 - (crop.left || 0) - (crop.right || 0))),
  );
  const rectHeight = Math.max(
    1,
    Math.round(height * (1 - (crop.top || 0) - (crop.bottom || 0))),
  );
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}rect=${left},${top},${rectWidth},${rectHeight}`;
}

function imageStyleAttr(image) {
  const hotspot = image?.hotspot;
  if (
    !hotspot ||
    typeof hotspot.x !== "number" ||
    typeof hotspot.y !== "number"
  )
    return "";
  return ` style="object-position:${Math.round(hotspot.x * 100)}% ${Math.round(hotspot.y * 100)}%"`;
}

function renderImage(image, alt = "", attrs = "") {
  const url = imageUrl(image);
  if (!url) return "";
  return `<img src="${escapeHtml(url)}" alt="${escapeHtml(image?.alt || image?.caption || alt)}"${attrs}${imageStyleAttr(image)}>`;
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
    .map((block) =>
      (block.children || []).map((child) => child.text || "").join(""),
    )
    .join(" ")
    .trim();
}

function renderBlocks(blocks = []) {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((block) => {
      if (block?._type === "image" || block?._type === "imageWithAlt") {
        const url = imageUrl(block);
        if (!url) return "";
        const caption = block.caption
          ? `<figcaption>${escapeHtml(block.caption)}</figcaption>`
          : "";
        return `<figure>${renderImage(block, "", ' loading="lazy" decoding="async"')}${caption}</figure>`;
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
      if (["h2", "h3", "h4"].includes(block.style || ""))
        return `<${block.style}>${html}</${block.style}>`;
      return `<p>${html}</p>`;
    })
    .join("");
}

function renderButtons(buttons = []) {
  if (!Array.isArray(buttons) || !buttons.length) return "";
  return `<div class="cms-buttons">${buttons
    .filter((button) => button?.text && resolveLink(button.url))
    .map(
      (button) =>
        `<a class="button ${button.variant === "outline" ? "ghost" : "primary"}" href="${escapeHtml(resolveLink(button.url))}">${escapeHtml(button.text)}</a>`,
    )
    .join("")}</div>`;
}

function renderImageCard(card) {
  const href = resolveLink(card.url);
  if (!href) return "";
  const image = imageUrl(card.image)
    ? renderImage(
        card.image,
        card.title || "",
        ' loading="lazy" decoding="async"',
      )
    : "";
  return `<a class="page-card" href="${escapeHtml(href)}">${image}<h3>${escapeHtml(card.title || "")}</h3><p>${escapeHtml(card.description || "")}</p>${renderCardLinkLabel()}</a>`;
}

function renderCardLinkLabel(label = "Les mer") {
  return `<span class="card-link-label">${escapeHtml(label)}<span aria-hidden="true">&rarr;</span></span>`;
}

function renderFeatureCardMarker(card, index) {
  const svg = typeof card?.icon?.svg === "string" ? card.icon.svg.trim() : "";
  if (svg.startsWith("<svg")) {
    return `<span class="feature-card-icon" aria-hidden="true">${svg}</span>`;
  }

  return `<span class="feature-card-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>`;
}

function serviceIconSvg(service) {
  const cmsSvg =
    typeof service?.icon?.svg === "string" ? service.icon.svg.trim() : "";
  if (cmsSvg.startsWith("<svg")) return cmsSvg;

  const slug = normalizePath(service?.slug);
  const icons = {
    "/stalbygg/":
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="9" y="9" width="30" height="30" stroke="currentColor" stroke-width="2.5"/><path d="M9 24h30M24 9v30" stroke="currentColor" stroke-width="2.5"/></svg>',
    "/vegger/":
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 23 24 11l16 12" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M14 22v17h20V22" stroke="currentColor" stroke-width="2.5"/><path d="M18 28h12M18 33h12" stroke="currentColor" stroke-width="2.5"/></svg>',
    "/broer/":
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 30c4-9 10-14 17-14s13 5 17 14" stroke="currentColor" stroke-width="2.5"/><path d="M8 33h32M13 33v5M20 33v5M28 33v5M35 33v5" stroke="currentColor" stroke-width="2.5"/></svg>',
    "/trapper/":
      '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 36h8v-6h8v-6h8v-6" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M13 17 31 35" stroke="currentColor" stroke-width="2.5"/></svg>',
  };

  return (
    icons[slug] ||
    '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 14h28v20H10z" stroke="currentColor" stroke-width="2.5"/><path d="M10 22h28" stroke="currentColor" stroke-width="2.5"/></svg>'
  );
}

function renderServiceCard(service) {
  return `<a class="service-card" href="${escapeHtml(normalizePath(service.slug))}"><span class="service-icon" aria-hidden="true">${serviceIconSvg(service)}</span><h3>${escapeHtml(pageTitle(service))}</h3><p>${escapeHtml(service.summary || "")}</p>${renderCardLinkLabel()}</a>`;
}

function renderBuilder(blocks = [], options = {}) {
  if (!Array.isArray(blocks)) return "";
  let heroIndex = 0;
  let ctaIndex = 0;
  return blocks
    .map((block) => {
      if (!block?._type) return "";
      if (block._type === "hero") {
        const currentHeroIndex = heroIndex++;
        const isHome = options.home === true;
        const services = options.services || [];

        if (isHome && currentHeroIndex === 0) {
          return `<section class="section cms-block home-services-intro"><div class="home-services-heading">${block.eyebrow || block.badge ? `<p class="eyebrow">${escapeHtml(block.eyebrow || block.badge)}</p>` : ""}${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}</div><div class="home-services-copy">${renderBlocks(block.richText)}${renderButtons(block.buttons)}${services.length ? '<a class="section-link" href="/tjenester/">Se alle tjenester</a>' : ""}</div></section>${services.length ? `<section class="section services home-services-grid" aria-label="Tjenester">${services.map(renderServiceCard).join("")}</section>` : ""}`;
        }

        if (isHome && currentHeroIndex === 1) {
          const image = block.image || options.proofImage;
          return `<section class="section cms-block home-proof"><div class="home-proof-media">${imageUrl(image) ? renderImage(image, image.alt || block.title || "", ' loading="lazy" decoding="async"') : ""}</div><div class="home-proof-copy">${block.eyebrow || block.badge ? `<p class="eyebrow">${escapeHtml(block.eyebrow || block.badge)}</p>` : ""}${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}${renderBlocks(block.richText)}${renderButtons(block.buttons)}</div></section>`;
        }

        const eyebrow = block.eyebrow || block.badge || "";
        const repeatsPageTitle =
          eyebrow.trim().toLocaleLowerCase("nb") ===
          String(options.pageTitle || "")
            .trim()
            .toLocaleLowerCase("nb");
        return `<section class="section cms-block">${eyebrow && !repeatsPageTitle ? `<p class="eyebrow">${escapeHtml(eyebrow)}</p>` : ""}${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}${renderBlocks(block.richText)}${renderButtons(block.buttons)}</section>`;
      }
      if (block._type === "cta") {
        const currentCtaIndex = ctaIndex++;
        const isHome = options.home === true;
        const services = options.services || [];

        if (isHome && currentCtaIndex === 0) {
          return `<section class="section cms-block home-services-intro"><div class="home-services-heading">${block.eyebrow || block.badge ? `<p class="eyebrow">${escapeHtml(block.eyebrow || block.badge)}</p>` : ""}${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}</div><div class="home-services-copy">${renderBlocks(block.richText)}${renderButtons(block.buttons)}${services.length ? '<a class="section-link" href="/tjenester/">Se alle tjenester</a>' : ""}</div></section>${services.length ? `<section class="section services home-services-grid" aria-label="Tjenester">${services.map(renderServiceCard).join("")}</section>` : ""}`;
        }

        if (isHome && currentCtaIndex === 1) {
          const image = block.image || options.proofImage;
          return `<section class="section cms-block home-proof"><div class="home-proof-media">${imageUrl(image) ? renderImage(image, image.alt || block.title || "", ' loading="lazy" decoding="async"') : ""}</div><div class="home-proof-copy">${block.eyebrow || block.badge ? `<p class="eyebrow">${escapeHtml(block.eyebrow || block.badge)}</p>` : ""}${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}${renderBlocks(block.richText)}${renderButtons(block.buttons)}</div></section>`;
        }

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

function renderGallery(gallery = [], { eyebrow = "Galleri", title = "Bilder" } = {}) {
  const images = (gallery || []).filter((image) => imageUrl(image));
  if (!images.length) return "";
  return `<section class="gallery-section"><div class="section-heading"><p class="eyebrow">${escapeHtml(eyebrow)}</p><h2>${escapeHtml(title)}</h2></div><div class="gallery">${images
    .map(
      (image, index) => {
        const src = imageUrl(image);
        const alt = image.alt || image.caption || "";
        const caption = image.caption || "";
        const label = `Vis bilde ${index + 1} av ${images.length}${alt ? `: ${alt}` : ""}`;
        return `<figure><button class="gallery-item" type="button" data-gallery-item data-gallery-src="${escapeHtml(src)}" data-gallery-alt="${escapeHtml(alt)}" data-gallery-caption="${escapeHtml(caption)}" aria-label="${escapeHtml(label)}">${renderImage(image, "", ' loading="lazy" decoding="async"')}<span class="gallery-zoom-icon" aria-hidden="true"></span></button>${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
      },
    )
    .join("")}</div></section>`;
}

function renderHero(data) {
  const doc = data.document;
  const images = (doc.heroImages || doc.gallery || []).filter((image) =>
    imageUrl(image),
  );
  const services = data.services || [];
  const slides = images.length
    ? `<div class="hero-media" aria-label="Prosjektbilder fra Fiskum Plate og Sveiseverksted">${images
        .map((image, index) => {
          const url = imageUrl(image);
          const srcAttrs =
            index === 0
              ? ` src="${escapeHtml(url)}" fetchpriority="high"`
              : ` data-src="${escapeHtml(url)}" loading="lazy"`;
          return `<figure class="hero-slide ${index === 0 ? "is-active" : ""}"><img${srcAttrs} alt="${escapeHtml(image.alt || image.caption || "")}" decoding="async"${imageStyleAttr(image)}></figure>`;
        })
        .join("")}</div>`
    : "";
  const dots =
    images.length > 1
      ? `<div class="hero-dots" aria-label="Velg hero-bilde">${images.map((_, index) => `<button class="${index === 0 ? "is-active" : ""}" type="button" aria-label="Vis bilde ${index + 1}"></button>`).join("")}</div>`
      : "";
  const strip = services.length
    ? `<div class="hero-strip">${services
        .map(
          (service) =>
            `<a href="${escapeHtml(normalizePath(service.slug))}"><strong>${escapeHtml(pageTitle(service))}</strong><small>${escapeHtml(service.summary || "")}</small></a>`,
        )
        .join("")}</div>`
    : "";
  return `<section class="hero">${slides}<div class="hero-copy"><p class="eyebrow">${escapeHtml(doc.description || "")}</p><h1>${escapeHtml(doc.title || "")}</h1>${doc.heroLead ? `<p>${escapeHtml(doc.heroLead)}</p>` : ""}<div class="hero-actions"><a class="button primary" href="/kontakt-oss/">Send forespørsel</a>${data.settings?.phone ? `<a class="button ghost" href="tel:${escapeHtml(data.settings.phone.replaceAll(" ", ""))}">${escapeHtml(data.settings.phone)}</a>` : ""}</div></div>${dots}${strip}</section>`;
}

function renderPdfs(pdfFiles = []) {
  const files = (pdfFiles || []).filter((file) => file?.url);
  if (!files.length) return "";
  return `<section class="pdf-downloads is-visible" aria-label="PDF-dokumenter"><h2>Dokumenter</h2><div class="pdf-download-list">${files
    .map(
      (file) =>
        `<a class="pdf-download" href="${escapeHtml(file.url)}" target="_blank" rel="noopener"><strong>${escapeHtml(file.title || "")}</strong>${file.description ? `<span>${escapeHtml(file.description)}</span>` : ""}</a>`,
    )
    .join("")}</div></section>`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function newsHref(post) {
  const slug = String(post.slug || "").replace(/^\/+|\/+$/g, "");
  if (!post.publishedAt) return normalizePath(slug);
  const date = new Date(post.publishedAt);
  if (Number.isNaN(date.getTime())) return normalizePath(slug);
  return `/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${slug}/`;
}

export function pageTitle(doc) {
  return doc?.title || doc?.internalTitle || "";
}

export function pageLead(doc) {
  return (
    doc?.description ||
    doc?.summary ||
    doc?.excerpt ||
    textFromBlocks(doc?.body) ||
    textFromBlocks(doc?.richText)
  );
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
  const logo = renderImage(
    settings?.logo || { url: settings?.logoUrl },
    settings?.companyName || "",
  );
  return `<header class="site-header"><a class="brand" href="/" aria-label="Til forsiden">${logo}<span>${escapeHtml(settings?.companyName || "")}</span></a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-nav"><span></span><span></span><span></span><span class="sr-only">Meny</span></button><nav id="primary-nav" class="nav" aria-label="Hovedmeny">${links.map((item) => `<a${/kontakt/i.test(item.name) ? ' class="nav-cta"' : ""} href="${escapeHtml(resolveLink(item.url))}">${escapeHtml(item.name)}</a>`).join("")}</nav></header>`;
}

function renderFooter(settings, footer, navbar) {
  const links = flattenNav(navbar);
  const phoneHref = (settings?.phone || "").replaceAll(" ", "");
  const logo = renderImage(
    settings?.logo || { url: settings?.logoUrl },
    settings?.companyName || "",
  );
  const legal = [
    footer?.copyrightText
      ? `<p class="copyright">${escapeHtml(footer.copyrightText)}</p>`
      : "",
    footer?.developerCreditText && footer?.developerCreditUrl
      ? `<a class="developer-credit" href="${escapeHtml(footer.developerCreditUrl)}" rel="noopener">${escapeHtml(footer.developerCreditText)}</a>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  return `<footer class="footer"><div class="footer-inner"><div class="footer-brand">${logo}${footer?.subtitle ? `<h2>${escapeHtml(footer.subtitle)}</h2>` : ""}</div><div class="footer-columns"><div><strong>Telefon</strong>${settings?.phone ? `<a href="tel:${escapeHtml(phoneHref)}">${escapeHtml(settings.phone)}</a>` : ""}</div><div><strong>E-post</strong>${settings?.contactEmail ? `<a href="mailto:${escapeHtml(settings.contactEmail)}">${escapeHtml(settings.contactEmail)}</a>` : ""}</div><address><strong>Adresse</strong>${escapeHtml(settings?.address?.street || "")}<br>${escapeHtml([settings?.address?.postalCode, settings?.address?.city].filter(Boolean).join(" "))}<br>${escapeHtml(settings?.address?.country || "")}</address><div><strong>Følg oss</strong>${settings?.socialLinks?.facebook ? `<a class="social-link" href="${escapeHtml(settings.socialLinks.facebook)}" aria-label="Facebook">f</a>` : ""}</div></div><div class="footer-bottom"><nav aria-label="Bunnmeny">${links.map((item) => `<a href="${escapeHtml(resolveLink(item.url))}">${escapeHtml(item.name)}</a>`).join("")}</nav>${legal ? `<div class="footer-legal">${legal}</div>` : ""}</div></div></footer>`;
}

function renderHome(data) {
  const doc = data.document;
  const services = data.services || [];
  const news = data.newsPosts || [];
  const faqs = data.faqs || [];
  const proofImage =
    doc.heroImages?.[2] || doc.heroImages?.[1] || doc.heroImages?.[0];
  return `<main id="top">${renderHero(data)}${renderBuilder(doc.pageBuilder, { home: true, services, proofImage })}${news.length ? `<section class="section news"><div class="section-heading"><p class="eyebrow">Aktuelt</p><h2>Aktuelt</h2></div><div class="news-grid">${news.slice(0, 2).map(renderNewsCard).join("")}</div><a class="back-link" href="/aktuelt/">Se alle nyheter</a></section>` : ""}${faqs.length ? `<section class="section faq"><div class="section-heading"><p class="eyebrow">FAQ</p><h2>Ofte stilte spørsmål</h2></div>${faqs.map((faq, index) => `<details ${index === 0 ? "open" : ""}><summary>${escapeHtml(faq.title || "")}</summary>${renderBlocks(faq.richText)}</details>`).join("")}</section>` : ""}</main>`;
}

function renderNewsCard(post) {
  return `<a class="news-card" href="${escapeHtml(newsHref(post))}">${imageUrl(post.image) ? renderImage(post.image, pageTitle(post), ' loading="lazy" decoding="async"') : ""}<div><p>${escapeHtml(formatDate(post.publishedAt))}</p><h3>${escapeHtml(pageTitle(post))}</h3>${renderCardLinkLabel()}</div></a>`;
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
    return `<div class="page-cards">${(data.services || []).map((service) => `<a class="page-card" href="${escapeHtml(normalizePath(service.slug))}"><h3>${escapeHtml(pageTitle(service))}</h3><p>${escapeHtml(service.summary || "")}</p>${renderCardLinkLabel()}</a>`).join("")}</div>`;
  }
  if (path === "/referanser/") {
    return `<div class="reference-list">${(data.references || []).map((reference) => `<a class="reference-card" href="/referanser/${escapeHtml(String(reference.slug || "").replace(/^\/+|\/+$/g, ""))}/">${imageUrl(reference.image) ? renderImage(reference.image, pageTitle(reference), ' loading="lazy" decoding="async"') : ""}<span>Referanse</span><h3>${escapeHtml(pageTitle(reference))}</h3><p>${escapeHtml(reference.summary || "")}</p>${renderCardLinkLabel()}</a>`).join("")}</div>`;
  }
  if (path === "/aktuelt/" || path === "/category/aktuelt/") {
    return `<div class="news-list">${(data.newsPosts || []).map((post) => `<a class="news-list-item" href="${escapeHtml(newsHref(post))}"><span>${escapeHtml(formatDate(post.publishedAt))}</span><h2>${escapeHtml(pageTitle(post))}</h2><p>${escapeHtml(post.excerpt || "")}</p>${renderCardLinkLabel()}</a>`).join("")}</div>`;
  }
  return "";
}

function renderContactDetails(doc, settings) {
  const business = doc?.contactDetails || {};
  const people = Array.isArray(doc?.contactPeople) ? doc.contactPeople : [];
  const address = settings?.address || {};
  const addressLine = [
    address.street,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
  const phoneHref = String(settings?.phone || "").replace(/[^+\d]/g, "");

  const facts = [
    settings?.phone
      ? `<div><dt>Telefon</dt><dd><a href="tel:${escapeHtml(phoneHref)}">${escapeHtml(settings.phone)}</a></dd></div>`
      : "",
    settings?.contactEmail
      ? `<div><dt>E-post</dt><dd><a href="mailto:${escapeHtml(settings.contactEmail)}">${escapeHtml(settings.contactEmail)}</a></dd></div>`
      : "",
    addressLine
      ? `<div><dt>Adresse</dt><dd>${escapeHtml(addressLine)}</dd></div>`
      : "",
    business.bankName
      ? `<div><dt>Bankforbindelse</dt><dd>${escapeHtml(business.bankName)}</dd></div>`
      : "",
    business.bankAccount
      ? `<div><dt>Bankgiro</dt><dd>${escapeHtml(business.bankAccount)}</dd></div>`
      : "",
    business.organizationNumber
      ? `<div><dt>Foretaksnummer</dt><dd>${escapeHtml(business.organizationNumber)}</dd></div>`
      : "",
  ].filter(Boolean);

  if (!facts.length && !people.length) return "";

  const peopleHtml = people.length
    ? `<div class="contact-people"><p class="eyebrow">Kontaktpersoner</p><div class="contact-people-grid">${people
        .map((person) => {
          const personPhoneHref = String(person?.phone || "").replace(
            /[^+\d]/g,
            "",
          );
          return `<article class="contact-person"><h3>${escapeHtml(person?.name || "")}</h3>${person?.role ? `<p>${escapeHtml(person.role)}</p>` : ""}<div class="contact-person-links">${person?.phone ? `<a href="tel:${escapeHtml(personPhoneHref)}"><span>Telefon</span>${escapeHtml(person.phone)}</a>` : ""}${person?.email ? `<a href="mailto:${escapeHtml(person.email)}"><span>E-post</span>${escapeHtml(person.email)}</a>` : ""}</div></article>`;
        })
        .join("")}</div></div>`
    : "";

  return `<section class="contact-information"><div class="contact-business"><p class="eyebrow">Bedriftsopplysninger</p>${settings?.companyName ? `<h2>${escapeHtml(settings.companyName)}</h2>` : ""}${facts.length ? `<dl class="contact-facts">${facts.join("")}</dl>` : ""}</div>${peopleHtml}</section>`;
}

function renderPage(data, path) {
  const doc = data.document;
  const title = pageTitle(doc);
  const lead = pageLead(doc);
  const galleryHeading =
    doc._type === "projectReference"
      ? { eyebrow: "Referanse", title: "Prosjektbilder" }
      : path === "/verksted/"
        ? { eyebrow: "Fra verkstedet", title: "Maskiner og utstyr" }
        : undefined;
  const body = [
    renderBlocks(doc.body),
    renderBlocks(doc.richText),
    renderBuilder(doc.pageBuilder, { pageTitle: title }),
    renderGallery(doc.gallery, galleryHeading),
    renderPdfs(doc.pdfFiles),
    path === "/kontakt-oss/" ? renderContactDetails(doc, data.settings) : "",
    path === "/kontakt-oss/" ? renderContactForm(data.settings) : "",
  ].join("");
  if (path === "/kontakt-oss/") {
    return `<main><section class="page-hero">${breadcrumbHtml(doc, path)}<p class="eyebrow">${escapeHtml(data.settings?.companyName || "")}</p><h1>${escapeHtml(title)}</h1>${lead ? `<p>${escapeHtml(lead)}</p>` : ""}</section><section class="page-content contact-page"><div class="content-stack">${body}</div></section></main>`;
  }
  return `<main><section class="page-hero">${breadcrumbHtml(doc, path)}<p class="eyebrow">${escapeHtml(data.settings?.companyName || "")}</p><h1>${escapeHtml(title)}</h1>${lead ? `<p>${escapeHtml(lead)}</p>` : ""}</section><section class="page-content"><div class="page-grid"><div class="content-stack">${body}</div>${renderSidePanel(data, path)}</div>${renderContextList(data, path)}</section></main>`;
}

function renderContactForm(settings) {
  const email = settings?.contactEmail || "";
  const action = email ? `https://formsubmit.co/${email}` : "";
  return `<section class="contact"><div class="contact-copy"><p class="eyebrow">Kontakt oss</p><h2>Send oss en forespørsel</h2><p>Har du spørsmål, er du alltid velkommen til å ta kontakt med oss.</p></div><form class="contact-form" action="${escapeHtml(action)}" method="POST" aria-label="Kontaktskjema"><input type="hidden" name="_subject" value="Ny forespørsel fra fiskum-sveis.no"><input type="hidden" name="_template" value="table"><input type="hidden" name="_captcha" value="false"><input type="hidden" name="_next" value="${productionOrigin}/kontakt-oss/?sendt=1"><input type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" class="honeypot"><label>Navn<input type="text" name="name" autocomplete="name" placeholder="Ditt navn" required></label><label>E-post<input type="email" name="email" autocomplete="email" placeholder="din@epost.no" required></label><label>Telefon<input type="tel" name="phone" autocomplete="tel" placeholder="Telefonnummer"></label><label>Hva gjelder det?<select name="topic" required><option>Stålbygg</option><option>Vegger, fasade og tak</option><option>Broer</option><option>Trapper og rekkverk</option><option>Kranutleie</option><option>Annet</option></select></label><label>Beskjed<textarea name="message" rows="5" placeholder="Skriv kort hva du trenger hjelp med" required></textarea></label><p class="form-status" role="status" aria-live="polite" hidden></p><button class="button primary" type="submit">Send forespørsel</button></form></section>`;
}

export function documentBody(data, path) {
  const doc = data.document;
  return `${renderHeader(data.settings, data.navbar)}${doc._type === "homePage" ? renderHome(data) : renderPage(data, path)}${renderFooter(data.settings, data.footer, data.navbar)}`;
}

export function pageHtml(data, path) {
  const doc = data.document;
  const title = pageTitle(doc) || data.settings?.siteTitle || "";
  const description = pageLead(doc) || data.settings?.siteDescription || "";
  const seoImage = imageUrl(
    doc?.seoImage ||
      doc?.mainImage ||
      doc?.image ||
      doc?.heroImages?.[0] ||
      doc?.gallery?.[0],
  );
  const canonicalUrl = new URL(path, productionOrigin).toString();
  const body = documentBody(data, path);
  return `<!doctype html>
<html lang="nb">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title ? `${title} - ${data.settings?.companyName || ""}` : "")}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:title" content="${escapeHtml(doc?.ogTitle || doc?.seoTitle || title)}" />
    <meta property="og:description" content="${escapeHtml(doc?.ogDescription || doc?.seoDescription || description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    ${seoImage ? `<meta property="og:image" content="${escapeHtml(seoImage)}" />` : ""}
    ${seoImage ? `<meta name="twitter:image" content="${escapeHtml(seoImage)}" />` : ""}
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
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

export function contentQuery() {
  const imageProjection = `alt, caption, crop, hotspot, "url": asset->url, asset->{url, metadata{dimensions{width,height}}}`;
  const portableProjection = `..., crop, hotspot, asset->{url, metadata{dimensions{width,height}}}`;
  const internalLinkProjection = `_id, _type, "slug": slug.current, publishedAt`;
  const linkProjection = `type, external, href, internal->{${internalLinkProjection}}`;
  const sharedFields = `_id, _type, internalTitle, title, description, heroLead, summary, excerpt, publishedAt, icon, seoTitle, seoDescription, seoNoIndex, ogTitle, ogDescription, "slug": slug.current,
    image{${imageProjection}},
    seoImage{${imageProjection}},
    mainImage{${imageProjection}},
    body[]{${portableProjection}},
    richText[]{${portableProjection}},
    gallery[]{${imageProjection}},
    heroImages[]{${imageProjection}},
    pageBuilder[]{
      ...,
      image{${imageProjection}},
      richText[]{${portableProjection}},
      cards[]{..., image{${imageProjection}}, richText[]{${portableProjection}}},
      faqs[]->{title, richText[]{${portableProjection}}},
      buttons[]{text, variant, url{${linkProjection}}}
    },
    contactDetails{bankName, bankAccount, organizationNumber},
    contactPeople[]{_key, name, role, phone, email},
    "pdfFiles": pdfFiles[]{title, description, "url": file.asset->url}`;
  return `{
    "settings": *[_type == "settings"][0]{companyName, siteTitle, siteDescription, phone, contactEmail, address, socialLinks, logo{${imageProjection}}, "logoUrl": logo.asset->url},
    "navbar": *[_type == "navbar"][0]{columns[]{_type, name, title, url{${linkProjection}}, links[]{name, url{${linkProjection}}}}},
    "footer": *[_type == "footer"][0]{subtitle, copyrightText, developerCreditText, developerCreditUrl, columns[]{title, links[]{name, url{${linkProjection}}}}},
    "homePage": *[_type == "homePage"][0]{${sharedFields}},
    "pages": *[_type == "page"] | order(_createdAt asc){${sharedFields}},
    "services": *[_type == "service"] | order(_createdAt asc){${sharedFields}, "image": gallery[0]{${imageProjection}}},
    "references": *[_type == "projectReference"] | order(_createdAt asc){${sharedFields}, category, "image": gallery[0]{${imageProjection}}},
    "newsPosts": *[_type == "newsPost"] | order(publishedAt desc){${sharedFields}, "image": mainImage{${imageProjection}}},
    "faqs": *[_type == "faq"] | order(_createdAt asc){title, richText[]{${portableProjection}}},
    "redirects": *[_type == "redirect"] | order(_createdAt asc){title, from, permanent, to{${linkProjection}}}
  }`;
}

export function queryUrl(query, params = {}) {
  const projectId = readEnv([
    "SANITY_PROJECT_ID",
    "SANITY_STUDIO_PROJECT_ID",
    "NEXT_PUBLIC_SANITY_PROJECT_ID",
  ]);
  const dataset = readEnv([
    "SANITY_DATASET",
    "SANITY_STUDIO_DATASET",
    "NEXT_PUBLIC_SANITY_DATASET",
  ]);
  const apiVersion = readEnv([
    "SANITY_API_VERSION",
    "SANITY_STUDIO_API_VERSION",
    "NEXT_PUBLIC_SANITY_API_VERSION",
  ]);
  const searchParams = new URLSearchParams({ query, ...params });
  return `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}?${searchParams.toString()}`;
}

export function routeFor(doc) {
  if (doc._type === "homePage") return "/";
  if (doc._type === "projectReference")
    return normalizePath(
      `/referanser/${String(doc.slug || "").replace(/^\/+|\/+$/g, "")}`,
    );
  if (doc._type === "newsPost") return newsHref(doc);
  return normalizePath(doc.slug);
}

export function validateContent(data, documents) {
  const issues = [];

  if (!data?.settings) issues.push("Mangler Site Settings i Sanity.");
  if (!data?.navbar) issues.push("Mangler Header og hovedmeny i Sanity.");
  if (!data?.footer) issues.push("Mangler Footer i Sanity.");
  if (!data?.homePage) issues.push("Mangler publisert forside i Sanity.");
  if ((data?.services || []).length < 4)
    issues.push(
      `Mangler tjeneste-dokumenter i Sanity. Fant ${(data?.services || []).length}, forventet minst 4.`,
    );
  if ((data?.references || []).length < 4)
    issues.push(
      `Mangler referanse-dokumenter i Sanity. Fant ${(data?.references || []).length}, forventet minst 4.`,
    );
  if ((data?.newsPosts || []).length < 1)
    issues.push("Mangler nyheter/Aktuelt i Sanity.");

  return issues;
}

export function cmsErrorHtml(issues) {
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
          <p><a class="button primary" href="/studio/">Åpne Sanity Studio</a></p>
        </div>
      </section>
    </main>
  </body>
</html>
`;
}

function redirectHtml(destination) {
  return `<!doctype html>
<html lang="nb">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <meta http-equiv="refresh" content="0; url=${escapeHtml(destination)}" />
    <link rel="canonical" href="${escapeHtml(destination)}" />
    <title>Videresender</title>
  </head>
  <body>
    <p>Videresender til <a href="${escapeHtml(destination)}">${escapeHtml(destination)}</a>.</p>
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
  const entries = [
    "styles.css",
    "script.js",
    "favicon.ico",
    "assets",
    "studio",
    "static",
  ];
  for (const mirror of distMirrors) {
    const outputRoot = join(root, mirror);
    await mkdir(outputRoot, { recursive: true });
    for (const entry of entries) {
      const source = join(root, entry);
      if (await exists(source))
        await cp(source, join(outputRoot, entry), {
          recursive: true,
          force: true,
        });
    }
  }
}

async function prepareStudioStaticRoutes() {
  const studioRoutes = ["structure"];

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

export async function fetchContent(fetchOptions = {}, cacheKey = "") {
  const url = cacheKey
    ? `${queryUrl(contentQuery())}&$cacheKey=${encodeURIComponent(JSON.stringify(cacheKey))}`
    : queryUrl(contentQuery());
  const response = await fetch(url, fetchOptions);
  if (!response.ok)
    throw new Error(`Sanity svarte ${response.status} under build.`);
  const payload = await response.json();
  return payload.result;
}

export async function fetchPreviewContent(fetchOptions = {}) {
  const tokenEnvNames = [
    "SANITY_API_READ_TOKEN",
    "SANITY_READ_TOKEN",
    "SANITY_VIEWER_TOKEN",
    "SANITY_PREVIEW_TOKEN",
    "SANITY_STUDIO_READ_TOKEN",
    "SANITY_STUDIO_API_TOKEN",
    "SANITY_TOKEN",
    "SANITY_AUTH_TOKEN",
  ];
  const token = tokenEnvNames.map((name) => process.env[name]).find(Boolean);
  if (!token) {
    throw new Error(
      `Mangler Sanity read-token for draft preview. Legg inn en av disse i Vercel Production: ${tokenEnvNames.join(", ")}.`,
    );
  }

  const response = await fetch(
    queryUrl(contentQuery(), { perspective: "drafts" }),
    {
      ...fetchOptions,
      cache: "no-store",
      headers: {
        ...(fetchOptions.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if (!response.ok)
    throw new Error(`Sanity svarte ${response.status} under draft preview.`);
  const payload = await response.json();
  return payload.result;
}

export function allDocuments(data) {
  const documents = [
    data.homePage,
    ...(data.pages || []),
    ...(data.services || []),
    ...(data.references || []),
    ...(data.newsPosts || []),
  ].filter(Boolean);

  const byRoute = new Map();
  for (const document of documents) {
    const route = routeFor(document);
    if (!route || !byRoute.has(route)) {
      byRoute.set(route || document._id, document);
      continue;
    }

    const primary = byRoute.get(route);
    byRoute.set(route, {
      ...document,
      ...primary,
      description: primary.description || document.description,
      heroLead: primary.heroLead || document.heroLead,
      summary: primary.summary || document.summary,
      seoTitle: primary.seoTitle || document.seoTitle,
      seoDescription: primary.seoDescription || document.seoDescription,
      seoImage: primary.seoImage || document.seoImage,
      ogTitle: primary.ogTitle || document.ogTitle,
      ogDescription: primary.ogDescription || document.ogDescription,
    });
  }

  return [...byRoute.values()];
}

async function build() {
  const data = await fetchContent();
  const documents = allDocuments(data);

  const issues = validateContent(data, documents);
  await cleanGeneratedRoutes();
  await prepareDist();
  await prepareStudioStaticRoutes();

  if (issues.length) {
    const html = cmsErrorHtml(issues);
    await writeRoute("/", html);
    console.warn(
      `Sanity-innholdet er ikke komplett. Skrev tydelig CMS-feilside uten fallback:\n- ${issues.join("\n- ")}`,
    );
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
  if (aktuelt)
    await writeRoute(
      "/category/aktuelt/",
      pageHtml({ ...data, document: aktuelt }, "/category/aktuelt/"),
    );

  for (const redirectRule of data.redirects || []) {
    const source = normalizePath(redirectRule.from);
    const destination = resolveLink(redirectRule.to);
    if (!source || !destination || source === destination || routes.has(source))
      continue;
    await writeRoute(source, redirectHtml(destination));
  }

  console.log(`Generated ${routes.size} Sanity-backed routes.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await build();
}
