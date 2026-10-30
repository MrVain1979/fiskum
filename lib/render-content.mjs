import { stegaClean } from "@sanity/client/stega";
import { contentPath } from "./content-path.ts";
import { resolveSanityImage } from "./image.ts";
import { editAttribute, editFieldAttribute } from "./preview-owners.mjs";
import { renderSections } from "./section-renderer.mjs";
import {
  pageMetadata,
  pageMetaTitle,
  visibleHeading,
  requireSettings,
  breadcrumbTrail,
  organizationJsonLd,
  pageJsonLd,
  serializeJsonLd,
} from "./metadata.mjs";
import { contentQuery } from "./sanity-projections.mjs";
import { isPreviewDeployment, productionOrigin } from "./site-config.mjs";

export { contentQuery };

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
  return stegaClean(String(value ?? "")).trim();
}
function escapeText(value = "") {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  const target = url?.target;
  if (!target) return "";
  switch (cleanText(target.kind)) {
    case "internal":
      return target.document ? contentPath(target.document) || "" : "";
    case "email": {
      const email = cleanText(target.email);
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email}` : "";
    }
    case "phone": {
      const phone = cleanText(target.phone).replace(/[\s()-]/g, "");
      return /^\+?[0-9]{5,15}$/.test(phone) ? `tel:${phone}` : "";
    }
    case "anchor": {
      const anchor = cleanText(target.anchor);
      return /^[A-Za-z][A-Za-z0-9_-]*$/.test(anchor) ? `#${anchor}` : "";
    }
    case "file": {
      const file = cleanText(target.file?.asset?.url);
      return /^https:\/\/cdn\.sanity\.io\/files\/qgyys6fw\/production\//.test(
        file,
      )
        ? file
        : "";
    }
    case "external": {
      try {
        const href = new URL(cleanText(target.url));
        return ["https:", "http:"].includes(href.protocol) &&
          !href.username &&
          !href.password
          ? href.href
          : "";
      } catch {
        return "";
      }
    }
    default:
      return "";
  }
}

export function findRedirect(data, path) {
  const source = normalizePath(path);
  const redirect = (data?.redirects || []).find(
    (item) => normalizePath(item.from) === source,
  );
  if (!redirect)
    return data?.historyDestination && data.historyDestination !== source
      ? { destination: data.historyDestination, permanent: true }
      : null;

  const destination = resolveLink(redirect.to);
  if (!destination || destination === source) return null;

  return {
    destination,
    permanent: redirect.permanent !== false,
  };
}

function resolvedImage(image) {
  return resolveSanityImage(
    image?.asset
      ? image
      : { ...image, asset: { url: image?.url, metadata: image?.metadata } },
  );
}
function imageUrl(image) {
  return resolvedImage(image)?.src || "";
}
function imageDimensions(image) {
  const resolved = resolvedImage(image);
  return { width: resolved?.width, height: resolved?.height };
}
function imageStyleAttr(image) {
  const position = resolvedImage(image)?.objectPosition;
  return position ? ` style="object-position:${escapeHtml(position)}"` : "";
}
function responsiveImageAttrs(image) {
  const resolved = resolvedImage(image);
  if (!resolved) return "";
  const dimensions =
    resolved.width && resolved.height
      ? ` width="${resolved.width}" height="${resolved.height}"`
      : "";
  if (
    !resolved.src.startsWith("https://cdn.sanity.io/") ||
    !/\.(?:jpe?g|png|webp|avif|gif|tiff?)(?:\?|$)/i.test(resolved.src)
  )
    return dimensions;
  const widths = [
    ...new Set(
      [480, 768, 1200, 1900].map((w) => Math.min(w, resolved.width || w)),
    ),
  ];
  const srcset = widths
    .map((width) => {
      const url = new URL(resolved.src);
      url.searchParams.set("w", String(width));
      url.searchParams.set("auto", "format");
      return `${url.href} ${width}w`;
    })
    .join(", ");
  return `${dimensions} srcset="${escapeHtml(srcset)}" sizes="(max-width: 720px) 100vw, (max-width: 1100px) 90vw, 1180px"`;
}
function renderImage(image, alt = "", attrs = "") {
  const url = imageUrl(image);
  if (!url) return "";
  return `<img src="${escapeHtml(url)}" alt="${image?.decorative ? "" : escapeHtml(image?.alt || image?.caption || alt)}"${attrs}${responsiveImageAttrs(image)}${imageStyleAttr(image)}${editAttribute(image)}>`;
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

function richTextHref(value) {
  const href = cleanText(value);
  if (!href || /[\\\s\u0000-\u001f\u007f]/u.test(href)) return "";
  try {
    const decoded = decodeURIComponent(href);
    if (/[\\\u0000-\u001f\u007f]/u.test(decoded) || decoded.startsWith("//"))
      return "";
    if (href.startsWith("/") || href.startsWith("#")) return href;
    const url = new URL(href);
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? href
      : "";
  } catch {
    return "";
  }
}

function renderSpan(child, block) {
  // Preserve whitespace between marked spans and around hard breaks.
  let html = String(child?.text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
    .replace(/\r\n?|\n/g, "<br>");
  const marks = Array.isArray(child?.marks) ? child.marks : [];
  if (marks.includes("strong")) html = `<strong>${html}</strong>`;
  if (marks.includes("em")) html = `<em>${html}</em>`;
  if (marks.includes("code")) html = `<code>${html}</code>`;
  for (const key of marks) {
    const annotation = Array.isArray(block.markDefs)
      ? block.markDefs.find((definition) => definition?._key === key)
      : null;
    if (!annotation) continue;
    const link =
      annotation._type === "customLink"
        ? annotation.customLink
        : annotation._type === "link"
          ? annotation
          : null;
    if (!link) continue;
    const destination =
      annotation._type === "customLink" ? resolveLink(link) : link.href;
    const href = richTextHref(destination);
    if (!href || (link.target?.kind === "internal" && !href.startsWith("/")))
      continue;
    return `<a href="${escapeHtml(href)}"${link.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : ""}>${html}</a>`;
  }
  return html;
}

function renderBlocks(blocks = []) {
  if (!Array.isArray(blocks)) return "";
  let html = "";
  const lists = [];
  const closeList = () => {
    const current = lists.pop();
    if (current.itemOpen) html += "</li>";
    html += `</${current.tag}>`;
  };
  const closeLists = () => {
    while (lists.length) closeList();
  };
  for (const block of blocks) {
    if (block?._type === "image" || block?._type === "imageWithAlt") {
      closeLists();
      if (!imageUrl(block)) continue;
      const caption = block.caption
        ? `<figcaption>${escapeText(block.caption)}</figcaption>`
        : "";
      html += `<figure>${renderImage(block, "", ' loading="lazy" decoding="async"')}${caption}</figure>`;
      continue;
    }
    if (block?._type !== "block") continue;
    const children = Array.isArray(block.children) ? block.children : [];
    if (!cleanText(children.map((child) => child?.text || "").join("")))
      continue;
    const text = children.map((child) => renderSpan(child, block)).join("");
    if (!text) continue;
    if (["bullet", "number"].includes(block.listItem)) {
      const tag = block.listItem === "number" ? "ol" : "ul";
      const requestedLevel = Number.isInteger(block.level) ? block.level : 1;
      const level = Math.max(1, Math.min(requestedLevel, lists.length + 1, 6));
      while (lists.length > level) closeList();
      if (lists.length === level && lists.at(-1).tag !== tag) closeList();
      if (lists.length < level) {
        html += `<${tag}>`;
        lists.push({ tag, itemOpen: false });
      } else if (lists.at(-1).itemOpen) html += "</li>";
      html += `<li>${text}`;
      lists.at(-1).itemOpen = true;
      continue;
    }
    closeLists();
    const tag = ["h2", "h3", "h4", "h5", "h6"].includes(block.style || "")
      ? block.style
      : "p";
    html += `<${tag}>${text}</${tag}>`;
  }
  closeLists();
  return html;
}

function renderButtons(buttons = [], wrap = true, context = "") {
  const links = (buttons ?? [])
    .filter((button) => button?.text && resolveLink(button.url))
    .map((button) => {
      const variant = cleanText(button.variant);
      const className =
        variant === "link"
          ? context === "news"
            ? "back-link"
            : "section-link"
          : `button ${["outline", "secondary"].includes(variant) ? "ghost" : "primary"}`;
      return `<a class="${className}" href="${escapeHtml(resolveLink(button.url))}"${button.url?.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeText(button.text)}</a>`;
    })
    .join("");
  return links
    ? wrap
      ? `<div class="cms-buttons">${links}</div>`
      : links
    : "";
}

function linkWindowAttributes(url) {
  return url?.openInNewTab === true
    ? ' target="_blank" rel="noopener noreferrer"'
    : "";
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
  return `<a class="page-card" href="${escapeHtml(href)}"${linkWindowAttributes(card.url)}>${image}<h3>${escapeText(card.title || "")}</h3><p>${escapeText(card.description || "")}</p>${renderCardLinkLabel()}</a>`;
}

function renderCardLinkLabel(label = "Les mer") {
  return `<span class="card-link-label">${escapeText(label)}<span aria-hidden="true">&rarr;</span></span>`;
}

function safeIconSvg(value) {
  const svg = cleanText(value);
  return svg.startsWith("<svg") &&
    !/<(?:script|foreignObject|iframe|image)\b|\son[a-z]+\s*=|(?:href|src)\s*=/i.test(
      svg,
    )
    ? svg
    : "";
}
function renderFeatureCardMarker(card, index) {
  const svg = safeIconSvg(card?.icon?.svg);
  if (svg.startsWith("<svg")) {
    return `<span class="feature-card-icon" aria-hidden="true"${editAttribute(card.icon)}>${svg}</span>`;
  }

  return `<span class="feature-card-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>`;
}

function serviceIconSvg(service) {
  const cmsSvg = safeIconSvg(service?.icon?.svg);
  if (cmsSvg.startsWith("<svg")) return cmsSvg;

  return '<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"><path d="M7 39h34"/><path d="M10 34V14h28v20"/><path d="M10 22h28"/></svg>';
}

function renderServiceCard(service) {
  return `<a class="service-card" href="${escapeHtml(contentPath(service))}"><span class="service-icon" aria-hidden="true"${editAttribute(service.icon)}>${serviceIconSvg(service)}</span><h3>${escapeText(pageTitle(service))}</h3><p>${escapeText(service.summary || "")}</p>${renderCardLinkLabel()}</a>`;
}

function renderLegacyBuilder(blocks = [], options = {}) {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((block) => {
      if (!block?._type) return "";
      if (block._type === "hero") {
        const services = options.services || [];

        if (cleanText(block.layout) === "services") {
          return `<section class="section cms-block home-services-intro"><div class="home-services-heading">${block.eyebrow || block.badge ? `<p class="eyebrow">${escapeText(block.eyebrow || block.badge)}</p>` : ""}${block.title ? `<h2>${escapeText(block.title)}</h2>` : ""}</div><div class="home-services-copy">${renderBlocks(block.richText)}${renderButtons(block.buttons)}${services.length ? renderButtons(block.serviceLink ? [block.serviceLink] : [], false) : ""}</div></section>${services.length ? `<section class="section services home-services-grid" aria-label="Tjenester">${services.map(renderServiceCard).join("")}</section>` : ""}`;
        }

        if (cleanText(block.layout) === "proof") {
          const image = block.image;
          return `<section class="section cms-block home-proof"><div class="home-proof-media">${imageUrl(image) ? renderImage(image, image.alt || block.title || "", ' loading="lazy" decoding="async"') : ""}</div><div class="home-proof-copy">${block.eyebrow || block.badge ? `<p class="eyebrow">${escapeText(block.eyebrow || block.badge)}</p>` : ""}${block.title ? `<h2>${escapeText(block.title)}</h2>` : ""}${renderBlocks(block.richText)}${renderButtons(block.buttons)}</div></section>`;
        }

        const eyebrow = block.eyebrow || block.badge || "";
        const repeatsPageTitle =
          cleanText(eyebrow).toLocaleLowerCase("nb") ===
          cleanText(options.pageTitle || "").toLocaleLowerCase("nb");
        return `<section class="section cms-block">${eyebrow && !repeatsPageTitle ? `<p class="eyebrow">${escapeText(eyebrow)}</p>` : ""}${block.title ? `<h2>${escapeText(block.title)}</h2>` : ""}${renderBlocks(block.richText)}${renderButtons(block.buttons)}</section>`;
      }
      if (block._type === "cta") {
        const services = options.services || [];

        if (cleanText(block.layout) === "services") {
          return `<section class="section cms-block home-services-intro"><div class="home-services-heading">${block.eyebrow || block.badge ? `<p class="eyebrow">${escapeText(block.eyebrow || block.badge)}</p>` : ""}${block.title ? `<h2>${escapeText(block.title)}</h2>` : ""}</div><div class="home-services-copy">${renderBlocks(block.richText)}${renderButtons(block.buttons)}${services.length ? renderButtons(block.serviceLink ? [block.serviceLink] : [], false) : ""}</div></section>${services.length ? `<section class="section services home-services-grid" aria-label="Tjenester">${services.map(renderServiceCard).join("")}</section>` : ""}`;
        }

        if (cleanText(block.layout) === "proof") {
          const image = block.image;
          return `<section class="section cms-block home-proof"><div class="home-proof-media">${imageUrl(image) ? renderImage(image, image.alt || block.title || "", ' loading="lazy" decoding="async"') : ""}</div><div class="home-proof-copy">${block.eyebrow || block.badge ? `<p class="eyebrow">${escapeText(block.eyebrow || block.badge)}</p>` : ""}${block.title ? `<h2>${escapeText(block.title)}</h2>` : ""}${renderBlocks(block.richText)}${renderButtons(block.buttons)}</div></section>`;
        }

        return `<section class="section cms-block">${block.eyebrow || block.badge ? `<p class="eyebrow">${escapeText(block.eyebrow || block.badge)}</p>` : ""}${block.title ? `<h2>${escapeText(block.title)}</h2>` : ""}${renderBlocks(block.richText)}${renderButtons(block.buttons)}</section>`;
      }
      if (block._type === "featureCardsIcon") {
        return `<section class="section cms-block">${block.eyebrow ? `<p class="eyebrow">${escapeText(block.eyebrow)}</p>` : ""}${block.title ? `<h2>${escapeText(block.title)}</h2>` : ""}${renderBlocks(block.richText)}<div class="feature-card-grid">${(block.cards || []).map((card, index) => `<article class="feature-card">${renderFeatureCardMarker(card, index)}<h3>${escapeText(card.title || "")}</h3>${renderBlocks(card.richText)}</article>`).join("")}</div></section>`;
      }
      if (block._type === "imageLinkCards") {
        return `<section class="section cms-block">${block.eyebrow ? `<p class="eyebrow">${escapeText(block.eyebrow)}</p>` : ""}${block.title ? `<h2>${escapeText(block.title)}</h2>` : ""}${renderBlocks(block.richText)}<div class="page-cards">${(block.cards || []).map(renderImageCard).join("")}</div>${renderButtons(block.buttons)}</section>`;
      }
      if (block._type === "faqAccordion") {
        const heading = `${block.eyebrow ? `<p class="eyebrow">${escapeText(block.eyebrow)}</p>` : ""}${block.title ? `<h2>${escapeText(block.title)}</h2>` : ""}`;
        const link = resolveLink(block.link?.url);
        return `<section class="section faq cms-block">${cleanText(block.layout) === "home" ? `<div class="section-heading">${heading}</div>` : heading}${block.subtitle ? `<p>${escapeText(block.subtitle)}</p>` : ""}${(
          block.faqs ?? []
        )
          .filter(Boolean)
          .map(
            (faq, index) =>
              `<details ${index === 0 ? "open" : ""}><summary>${escapeText(faq.title || "")}</summary>${renderBlocks(faq.richText)}</details>`,
          )
          .join(
            "",
          )}${link ? `<a class="section-link" href="${escapeHtml(link)}"${block.link.url?.openInNewTab ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeText(block.link.title || "Les mer")}</a>${block.link.description ? `<p>${escapeText(block.link.description)}</p>` : ""}` : ""}</section>`;
      }
      return "";
    })
    .join("");
}

function renderGallery(gallery = [], heading) {
  const images = (gallery || []).filter((image) => imageUrl(image));
  if (!images.length) return "";
  const eyebrow = heading ? heading.eyebrow || "" : "Galleri";
  const title = heading ? heading.title || "" : "Bilder";
  const headingHtml =
    eyebrow || title
      ? `<div class="section-heading">${eyebrow ? `<p class="eyebrow">${escapeText(eyebrow)}</p>` : ""}${title ? `<h2>${escapeText(title)}</h2>` : ""}</div>`
      : "";
  return `<section class="gallery-section">${headingHtml}<div class="gallery">${images
    .map((image, index) => {
      const src = imageUrl(image);
      const alt = image.alt || image.caption || "";
      const caption = image.caption || "";
      const label = `Vis bilde ${index + 1} av ${images.length}${alt ? `: ${alt}` : ""}`;
      return `<figure><button${editAttribute(image)} class="gallery-item" type="button" data-gallery-item data-gallery-src="${escapeHtml(src)}" data-gallery-alt="${escapeHtml(alt)}" data-gallery-caption="${escapeHtml(caption)}" aria-label="${escapeHtml(label)}">${renderImage(image, "", ' loading="lazy" decoding="async"')}<span class="gallery-zoom-icon" aria-hidden="true"></span></button>${caption ? `<figcaption>${escapeText(caption)}</figcaption>` : ""}</figure>`;
    })
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
          const responsive = responsiveImageAttrs(image);
          return `<figure class="hero-slide ${index === 0 ? "is-active" : ""}"${editAttribute(image)}><img${srcAttrs} alt="${image.decorative ? "" : escapeHtml(image.alt || image.caption || "")}" decoding="async"${index === 0 ? responsive : responsive.replace(" srcset=", " data-srcset=")}${imageStyleAttr(image)}${editAttribute(image)}></figure>`;
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
            `<a href="${escapeHtml(contentPath(service))}"><strong>${escapeText(pageTitle(service))}</strong><small>${escapeText(service.summary || "")}</small></a>`,
        )
        .join("")}</div>`
    : "";
  const heading = data.heroHeading === "h1" ? "h1" : "h2";
  const phone =
    data.useGlobalPhone && data.settings?.phone
      ? `<a class="button ghost" href="tel:${escapeHtml(cleanText(data.settings.phone).replaceAll(" ", ""))}">${escapeText(data.settings.phone)}</a>`
      : "";
  return `<section class="hero">${slides}<div class="hero-copy">${data.heroBreadcrumb || ""}<p class="eyebrow">${escapeText(doc.description || "")}</p>${cleanText(doc.title) ? `<${heading}>${escapeText(doc.title)}</${heading}>` : ""}${doc.heroLead ? `<p>${escapeText(doc.heroLead)}</p>` : ""}<div class="hero-actions">${renderButtons(data.heroButtons ?? [], false)}${phone}</div></div>${dots}${strip}</section>`;
}

function renderPdfs(pdfFiles = [], title = "Dokumenter") {
  const files = (pdfFiles || []).filter((file) => file?.url);
  if (!files.length) return "";
  return `<section class="pdf-downloads is-visible" aria-label="PDF-dokumenter"><h2>${escapeText(title || "Dokumenter")}</h2><div class="pdf-download-list">${files
    .map(
      (file) =>
        `<a class="pdf-download" href="${escapeHtml(file.url)}" target="_blank" rel="noopener"><strong>${escapeText(file.title || "")}</strong>${file.description ? `<span>${escapeText(file.description)}</span>` : ""}</a>`,
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
  return cleanText(doc?.title) ? doc.title : "";
}

export { pageMetadata, pageMetaTitle };

export function pageLead(doc) {
  return doc?.intro ?? "";
}

function breadcrumbHtml(doc, path) {
  if (path === "/") return "";
  const trail = breadcrumbTrail(doc, pageTitle(doc));
  const links = trail
    .slice(1, -1)
    .map(
      (parent) =>
        `<span class="breadcrumb-separator" aria-hidden="true">/</span><a href="${escapeHtml(parent.path)}">${escapeText(parent.title)}</a>`,
    )
    .join("");
  return `<nav class="breadcrumbs" aria-label="Brødsmulesti"><a href="/">Forsiden</a>${links}<span class="breadcrumb-separator" aria-hidden="true">/</span><span aria-current="page">${escapeText(pageTitle(doc))}</span></nav>`;
}

function renderHeader(settings, navbar) {
  const links = flattenNav(navbar);
  const logo = renderImage(
    settings?.logo || { url: settings?.logoUrl },
    settings?.companyName || "",
  );
  return `<header class="site-header"><a class="brand" href="/" aria-label="Til forsiden">${logo}<span>${escapeText(settings?.companyName || "")}</span></a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="primary-nav"><span></span><span></span><span></span><span class="sr-only">Meny</span></button><nav id="primary-nav" class="nav" aria-label="Hovedmeny">${links.map((item) => `<a${/kontakt/i.test(cleanText(item.name)) ? ' class="nav-cta"' : ""} href="${escapeHtml(resolveLink(item.url))}"${linkWindowAttributes(item.url)}>${escapeText(item.name)}</a>`).join("")}</nav></header>`;
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
      ? `<p class="copyright">${escapeText(footer.copyrightText)}</p>`
      : "",
    footer?.developerCreditText && footer?.developerCreditUrl
      ? `<a class="developer-credit" href="${escapeHtml(footer.developerCreditUrl)}" rel="noopener">${escapeText(footer.developerCreditText)}</a>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  return `<footer class="footer"><div class="footer-inner"><div class="footer-brand">${logo}${footer?.subtitle ? `<h2>${escapeText(footer.subtitle)}</h2>` : ""}</div><div class="footer-columns"><div><strong>Telefon</strong>${settings?.phone ? `<a href="tel:${escapeHtml(phoneHref)}">${escapeText(settings.phone)}</a>` : ""}</div><div><strong>E-post</strong>${settings?.contactEmail ? `<a href="mailto:${escapeHtml(settings.contactEmail)}">${escapeText(settings.contactEmail)}</a>` : ""}</div><address><strong>Adresse</strong>${escapeText(settings?.address?.street || "")}<br>${escapeText([settings?.address?.postalCode, settings?.address?.city].filter(Boolean).join(" "))}<br>${escapeText(settings?.address?.country || "")}</address><div><strong>Følg oss</strong>${Object.entries(
    {
      facebook: ["Facebook", "f"],
      linkedin: ["LinkedIn", "in"],
      twitter: ["X / Twitter", "x"],
      instagram: ["Instagram", "ig"],
      youtube: ["YouTube", "yt"],
    },
  )
    .map(([key, [label, mark]]) => {
      const href = richTextHref(settings?.socialLinks?.[key]);
      return /^https?:\/\//.test(href)
        ? `<a${editFieldAttribute(settings, ["socialLinks", key])} class="social-link" href="${escapeHtml(href)}" aria-label="${label}">${mark}</a>`
        : "";
    })
    .join(
      "",
    )}</div></div><div class="footer-bottom"><nav aria-label="Bunnmeny">${links.map((item) => `<a href="${escapeHtml(resolveLink(item.url))}"${linkWindowAttributes(item.url)}>${escapeText(item.name)}</a>`).join("")}</nav>${legal ? `<div class="footer-legal">${legal}</div>` : ""}</div></div></footer>`;
}

function sectionHelpers() {
  return {
    visibleHeading,
    breadcrumbHtml,
    contentPath,
    escapeHtml,
    escapeText,
    renderLegacyBuilder,
    renderHero,
    renderBlocks,
    renderGallery,
    renderPdfs,
    renderQuote,
    renderContactDetails,
    renderContactForm,
    renderContextList,
    renderNewsCard,
    renderButtons,
  };
}
function renderBuilder(sections, options = {}) {
  return renderSections(
    sections,
    { ...options, data: options.data || {} },
    sectionHelpers(),
  );
}
function renderHome(data) {
  const doc = data.document;
  const primary =
    doc.sections?.find((section) => !section.hidden)?._type === "heroCarousel";
  return `<main id="top">${primary ? "" : `<section class="page-hero"><h1>${escapeText(visibleHeading(doc, data.settings))}</h1></section>`}${renderBuilder(doc.sections, { data, primaryHero: primary })}</main>`;
}
function renderQuote(quote) {
  return `<aside class="side-panel side-panel-quote"><span class="eyebrow">Kundesitat</span><blockquote>${quote.quote ? `<p>${escapeText(quote.quote)}</p>` : ""}${quote.author || quote.company ? `<cite>${escapeText([quote.author, quote.company].filter(Boolean).join(", "))}</cite>` : ""}</blockquote></aside>`;
}

function renderNewsCard(post) {
  return `<a class="news-card" href="${escapeHtml(contentPath(post))}">${imageUrl(post.image) ? renderImage(post.image, pageTitle(post), ' loading="lazy" decoding="async"') : ""}<div><p${editFieldAttribute(post, ["publishedAt"])}>${escapeText(formatDate(post.publishedAt))}</p><h3>${escapeText(pageTitle(post))}</h3>${renderCardLinkLabel()}</div></a>`;
}

function renderSidePanel(data, path) {
  const settings = data.settings;
  if (path === "/tjenester/") {
    return `<aside class="side-panel"><strong>Kontakt</strong>${settings?.phone ? `<a href="tel:${escapeHtml(settings.phone.replaceAll(" ", ""))}">${escapeText(settings.phone)}</a>` : ""}${settings?.contactEmail ? `<a href="mailto:${escapeHtml(settings.contactEmail)}">${escapeText(settings.contactEmail)}</a>` : ""}</aside>`;
  }
  if (data.document?.sidebarVariant === "services") {
    return `<aside class="side-panel"><strong>Tjenester</strong>${(data.services || []).map((service) => `<a href="${escapeHtml(contentPath(service))}">${escapeText(pageTitle(service))}</a>`).join("")}</aside>`;
  }
  return `<aside class="side-panel"><strong>Kontakt</strong>${settings?.phone ? `<a href="tel:${escapeHtml(settings.phone.replaceAll(" ", ""))}">${escapeText(settings.phone)}</a>` : ""}${settings?.contactEmail ? `<a href="mailto:${escapeHtml(settings.contactEmail)}">${escapeText(settings.contactEmail)}</a>` : ""}</aside>`;
}

function renderContextList(data, path) {
  if (path === "/tjenester/") {
    return `<div class="page-cards">${(data.services || []).map((service) => `<a class="page-card" href="${escapeHtml(contentPath(service))}"><h2 class="card-title">${escapeText(pageTitle(service))}</h2><p>${escapeText(service.summary || "")}</p>${renderCardLinkLabel()}</a>`).join("")}</div>`;
  }
  if (path === "/referanser/") {
    return `<div class="reference-list">${(data.references || []).map((reference) => `<a class="reference-card" href="${escapeHtml(contentPath(reference))}">${imageUrl(reference.image) ? renderImage(reference.image, pageTitle(reference), ' loading="lazy" decoding="async"') : ""}<span>Referanse</span><h2 class="card-title">${escapeText(pageTitle(reference))}</h2><p>${escapeText(reference.summary || "")}</p>${renderCardLinkLabel()}</a>`).join("")}</div>`;
  }
  if (path === "/aktuelt/" || path === "/category/aktuelt/") {
    return `<div class="news-list">${(data.newsPosts || []).map((post) => `<a class="news-list-item" href="${escapeHtml(contentPath(post))}"><span${editFieldAttribute(post, ["publishedAt"])}>${escapeText(formatDate(post.publishedAt))}</span><h2>${escapeText(pageTitle(post))}</h2><p>${escapeText(post.excerpt || "")}</p>${renderCardLinkLabel()}</a>`).join("")}</div>`;
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
      ? `<div><dt>Telefon</dt><dd><a href="tel:${escapeHtml(phoneHref)}">${escapeText(settings.phone)}</a></dd></div>`
      : "",
    settings?.contactEmail
      ? `<div><dt>E-post</dt><dd><a href="mailto:${escapeHtml(settings.contactEmail)}">${escapeText(settings.contactEmail)}</a></dd></div>`
      : "",
    addressLine
      ? `<div><dt>Adresse</dt><dd>${escapeText(addressLine)}</dd></div>`
      : "",
    business.bankName
      ? `<div><dt>Bankforbindelse</dt><dd>${escapeText(business.bankName)}</dd></div>`
      : "",
    business.bankAccount
      ? `<div><dt>Bankgiro</dt><dd>${escapeText(business.bankAccount)}</dd></div>`
      : "",
    business.organizationNumber
      ? `<div><dt>Foretaksnummer</dt><dd>${escapeText(business.organizationNumber)}</dd></div>`
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
          return `<article class="contact-person"><h3>${escapeText(person?.name || "")}</h3>${person?.role ? `<p>${escapeText(person.role)}</p>` : ""}<div class="contact-person-links">${person?.phone ? `<a href="tel:${escapeHtml(personPhoneHref)}"><span>Telefon</span>${escapeText(person.phone)}</a>` : ""}${person?.email ? `<a href="mailto:${escapeHtml(person.email)}"><span>E-post</span>${escapeText(person.email)}</a>` : ""}</div></article>`;
        })
        .join("")}</div></div>`
    : "";

  return `<section class="contact-information"><div class="contact-business"><p class="eyebrow">Bedriftsopplysninger</p>${settings?.companyName ? `<h2>${escapeText(settings.companyName)}</h2>` : ""}${facts.length ? `<dl class="contact-facts">${facts.join("")}</dl>` : ""}</div>${peopleHtml}</section>`;
}

function renderPage(data, path) {
  const doc = data.document,
    title = visibleHeading(doc, data.settings),
    lead = pageLead(doc);
  const sections = (doc.sections ?? []).filter((section) => !section.hidden);
  const primary = sections[0]?._type === "heroCarousel";
  const top = primary
    ? renderBuilder([sections[0]], { data, primaryHero: true })
    : `<section class="page-hero">${breadcrumbHtml({ ...doc, title }, path)}<p class="eyebrow">${escapeText(data.settings?.companyName || "")}</p><h1>${escapeText(title)}</h1>${lead ? `<p>${escapeText(lead)}</p>` : ""}</section>`;
  const remaining = primary ? sections.slice(1) : sections;
  const sidebar = remaining.filter(
    (section) => cleanText(section.placement) === "sidebar",
  );
  const inside = remaining.filter(
    (section) =>
      !["sidebar", "afterContent"].includes(cleanText(section.placement)),
  );
  const after = remaining.filter(
    (section) => cleanText(section.placement) === "afterContent",
  );
  const contact = sections.some(
    (section) => section._type === "contactInformation",
  );
  const side = sidebar.length
    ? renderBuilder(sidebar, { data })
    : doc.sidebarVariant === "none"
      ? ""
      : renderSidePanel(data, path);
  const children = (doc.children ?? [])
    .map((child) => {
      const href = contentPath(child);
      return href
        ? `<a href="${escapeHtml(href)}">${escapeText(child.navigationTitle || child.title || "")}</a>`
        : "";
    })
    .join("");
  return `<main>${top}<section class="page-content${contact ? " contact-page" : ""}"><div class="page-grid${contact ? " contact-intro-grid" : ""}"><div class="content-stack">${renderBuilder(inside, { data, pageTitle: title })}</div>${side}</div>${renderBuilder(after, { data })}${children ? `<nav class="child-pages" aria-label="Undersider"><h2>Undersider</h2>${children}</nav>` : ""}</section></main>`;
}

function renderContactForm(settings, section = {}) {
  const email = settings?.contactEmail || "";
  const action = email ? "/api/forms/contact" : "";
  return `<section class="contact"><div class="contact-copy"><p class="eyebrow">Kontakt oss</p><h2>${escapeText(section.title || "Send oss en forespørsel")}</h2><p>${escapeText(section.lead || "Har du spørsmål, er du alltid velkommen til å ta kontakt med oss.")}</p></div><form${section.preview ? ' data-preview-disabled="true"' : ""} class="contact-form" action="${escapeHtml(action)}" method="POST" aria-label="Kontaktskjema"><input type="hidden" name="_subject" value="Ny forespørsel fra fiskum-sveis.no"><input type="hidden" name="_template" value="table"><input type="hidden" name="_captcha" value="false"><input type="hidden" name="_next" value="${productionOrigin}/kontakt-oss/?sendt=1"><input type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" class="honeypot"><label>Navn<input type="text" name="name" autocomplete="name" placeholder="Ditt navn" required></label><label>E-post<input type="email" name="email" autocomplete="email" placeholder="din@epost.no" required></label><label>Telefon<input type="tel" name="phone" autocomplete="tel" placeholder="Telefonnummer"></label><label>Hva gjelder det?<select name="topic" required><option>Stålbygg</option><option>Vegger, fasade og tak</option><option>Broer</option><option>Trapper og rekkverk</option><option>Kranutleie</option><option>Annet</option></select></label><label>Beskjed<textarea name="message" rows="5" placeholder="Skriv kort hva du trenger hjelp med" required></textarea></label><p class="form-status" role="status" aria-live="polite" hidden></p><button class="button primary" type="submit"${section.preview ? ' disabled aria-disabled="true"' : ""}>Send forespørsel</button></form></section>`;
}

export function documentBody(data, path) {
  const doc = data.document;
  return `${renderHeader(data.settings, data.navbar)}${doc._type === "homePage" ? renderHome(data) : renderPage(data, path)}${renderFooter(data.settings, data.footer, data.navbar)}`;
}

export function pageHtml(data, path, options) {
  const metadata = pageMetadata(data, path, options);
  const seoImage = metadata.openGraph.images[0];
  const canonicalUrl = metadata.alternates.canonical;
  const body = documentBody(data, path);
  return `<!doctype html>
<html lang="nb">
  <head>
    <meta charset="utf-8" />
    <script type="application/ld+json">${serializeJsonLd([organizationJsonLd(data.settings), ...pageJsonLd(data, path, options)])}</script>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeText(metadata.title)}</title>
    <meta name="description" content="${escapeHtml(metadata.description)}" />
    ${metadata.robots?.index === false ? `<meta name="robots" content="noindex, ${metadata.robots.follow ? "follow" : "nofollow"}" />` : ""}
    <meta property="og:type" content="${metadata.openGraph.type}" />
    ${metadata.openGraph.publishedTime ? `<meta property="article:published_time" content="${escapeHtml(metadata.openGraph.publishedTime)}" />` : ""}
    ${metadata.openGraph.modifiedTime ? `<meta property="article:modified_time" content="${escapeHtml(metadata.openGraph.modifiedTime)}" />` : ""}
    <meta property="og:title" content="${escapeHtml(metadata.openGraph.title)}" />
    <meta property="og:description" content="${escapeHtml(metadata.openGraph.description)}" />
    <meta property="og:url" content="${escapeHtml(metadata.openGraph.url)}" />
    ${seoImage ? `<meta property="og:image" content="${escapeHtml(seoImage.url)}" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" /><meta property="og:image:alt" content="${escapeHtml(seoImage.alt)}" />` : ""}
    ${seoImage ? `<meta name="twitter:card" content="summary_large_image" /><meta name="twitter:image" content="${escapeHtml(seoImage.url)}" /><meta name="twitter:image:alt" content="${escapeHtml(seoImage.alt)}" />` : ""}
    <link rel="icon" href="/favicon.ico" sizes="any" />
    ${canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />` : ""}
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
  return contentPath(doc);
}

export function validateContent(data, documents) {
  const issues = [];

  if (!data?.settings) issues.push("Mangler Site Settings i Sanity.");
  if (!data?.navbar) issues.push("Mangler Header og hovedmeny i Sanity.");
  if (!data?.footer) issues.push("Mangler Footer i Sanity.");
  if (!data?.homePage) issues.push("Mangler publisert forside i Sanity.");
  try {
    requireSettings(data?.settings);
  } catch (error) {
    issues.push(error.message);
  }

  const routes = [
    data?.homePage,
    ...(data?.pages || []),
    ...(data?.services || []),
    ...(data?.references || []),
    ...(data?.newsPosts || []),
  ]
    .filter(Boolean)
    .map((document) => ({ id: document._id, route: routeFor(document) }))
    .filter((entry) => entry.route);
  const duplicateRoutes = routes.reduce((duplicates, entry) => {
    const matches = routes.filter(
      (candidate) => candidate.route === entry.route,
    );
    if (matches.length > 1)
      duplicates.set(
        entry.route,
        matches.map((match) => match.id),
      );
    return duplicates;
  }, new Map());

  for (const [route, ids] of duplicateRoutes) {
    issues.push(
      `Duplisert URL i Sanity: ${route} brukes av ${ids.join(", ")}.`,
    );
  }

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
          <ul>${issues.map((issue) => `<li>${escapeText(issue)}</li>`).join("")}</ul>
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
    <p>Videresender til <a href="${escapeHtml(destination)}">${escapeText(destination)}</a>.</p>
  </body>
</html>
`;
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

export { normalizePath, resolveLink, redirectHtml };
