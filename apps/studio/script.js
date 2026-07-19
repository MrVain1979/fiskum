document.documentElement.classList.add("js");

const root = document.querySelector("#site-root");
const config = window.FISKUM_SANITY_CONFIG;

function requireConfig() {
  const missing = ["projectId", "dataset", "apiVersion"].filter((key) => !config?.[key]);
  if (missing.length) {
    throw new Error(`Mangler Sanity-konfigurasjon: ${missing.join(", ")}`);
  }
  return config;
}

function queryUrl(query, params = {}) {
  const { projectId, dataset, apiVersion } = requireConfig();
  const encodedParams = Object.entries(params)
    .map(([key, value]) => `&%24${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`)
    .join("");

  return `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}?query=${encodeURIComponent(query)}${encodedParams}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizePath(value = "") {
  if (!value || value === "/") return "/";
  if (value.startsWith("http") || value.startsWith("#") || value.startsWith("mailto:") || value.startsWith("tel:")) return value;
  const path = value.startsWith("/") ? value : `/${value}`;
  return path.endsWith("/") ? path : `${path}/`;
}

function currentSlugs() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
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

function resolveLink(url) {
  if (!url) return "";
  if (url.type === "internal") return normalizePath(url.internal?.slug);
  return url.external || "";
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

function renderImageCard(card) {
  const href = resolveLink(card.url);
  if (!href) return "";
  const image = card.image?.url ? `<img src="${escapeHtml(card.image.url)}" alt="${escapeHtml(card.image.alt || card.title || "")}" loading="lazy" decoding="async">` : "";
  return `<a class="page-card" href="${escapeHtml(href)}">${image}<h3>${escapeHtml(card.title || "")}</h3><p>${escapeHtml(card.description || "")}</p></a>`;
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

function breadcrumbHtml(doc) {
  const title = pageTitle(doc);
  const isNews = doc?._type === "newsPost";
  const isReference = doc?._type === "projectReference";
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

function renderPage(data) {
  const doc = data.document;
  const title = pageTitle(doc);
  const lead = pageLead(doc);
  const body = [renderBlocks(doc.body), renderBlocks(doc.richText), renderBuilder(doc.pageBuilder), renderGallery(doc.gallery), renderPdfs(doc.pdfFiles)].join("");
  return `<main><section class="page-hero">${breadcrumbHtml(doc)}<p class="eyebrow">${escapeHtml(data.settings?.companyName || "")}</p><h1>${escapeHtml(title)}</h1>${lead ? `<p>${escapeHtml(lead)}</p>` : ""}</section><section class="page-content"><div class="page-grid"><div class="content-stack">${body}</div>${renderSidePanel(data)}</div>${renderContextList(data)}</section></main>`;
}

function renderSidePanel(data) {
  const settings = data.settings;
  if (window.location.pathname.startsWith("/tjenester")) {
    return `<aside class="side-panel"><strong>Tjenester</strong>${(data.services || []).map((service) => `<a href="${escapeHtml(normalizePath(service.slug))}">${escapeHtml(pageTitle(service))}</a>`).join("")}</aside>`;
  }
  return `<aside class="side-panel"><strong>Kontakt</strong>${settings?.phone ? `<a href="tel:${escapeHtml(settings.phone.replaceAll(" ", ""))}">${escapeHtml(settings.phone)}</a>` : ""}${settings?.contactEmail ? `<a href="mailto:${escapeHtml(settings.contactEmail)}">${escapeHtml(settings.contactEmail)}</a>` : ""}</aside>`;
}

function renderContextList(data) {
  const path = window.location.pathname;
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

function renderError(message) {
  if (!root) return;
  root.innerHTML = `<main><section class="page-hero cms-error"><h1>CMS-feil</h1><p>${escapeHtml(message)}</p></section></main>`;
}

function setMeta(data) {
  const doc = data.document;
  const title = pageTitle(doc) || data.settings?.siteTitle || "";
  const description = pageLead(doc) || data.settings?.siteDescription || "";
  if (title) document.title = `${title} - ${data.settings?.companyName || ""}`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
}

function initInteractions() {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector("#primary-nav");
  const setMenu = (open) => {
    document.body.classList.toggle("menu-open", open);
    toggle?.setAttribute("aria-expanded", String(open));
  };
  toggle?.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  nav?.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) setMenu(false);
  });

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealSelectors = [".page-hero > *", ".hero-copy > *", ".section > *", ".services article", ".page-grid > *", ".page-card", ".reference-card", ".news-card", ".news-list-item", ".gallery img", ".footer-brand", ".footer-columns > *", ".footer-bottom", ".pdf-downloads"].join(",");
  const items = Array.from(document.querySelectorAll(revealSelectors));
  items.forEach((item) => item.classList.add("reveal"));
  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  items.forEach((item) => observer.observe(item));
}

async function boot() {
  if (!root) return;
  try {
    requireConfig();
    const pathname = window.location.pathname;
    const response = await fetch(queryUrl(contentQuery(), {
      slugs: currentSlugs(),
      isReferencePath: pathname.startsWith("/referanser/") && pathname !== "/referanser/",
      isNewsPath: /^\/\d{4}\/\d{2}\/\d{2}\//.test(pathname),
    }), { cache: "no-store" });

    if (!response.ok) throw new Error(`Sanity svarte ${response.status}`);
    const payload = await response.json();
    const data = payload.result;

    if (!data?.settings) throw new Error("Mangler Site Settings i Sanity.");
    if (!data?.document) throw new Error(`Mangler publisert Sanity-dokument for ${window.location.pathname}.`);

    setMeta(data);
    root.innerHTML = `${renderHeader(data.settings, data.navbar)}${data.document._type === "homePage" ? renderHome(data) : renderPage(data)}${renderFooter(data.settings, data.footer, data.navbar)}`;
    initInteractions();
  } catch (error) {
    renderError(error instanceof Error ? error.message : "Ukjent Sanity-feil.");
  }
}

boot();
