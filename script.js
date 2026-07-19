document.documentElement.classList.add("js");

const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#primary-nav");

function setMenu(open) {
  document.body.classList.toggle("menu-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
}

toggle?.addEventListener("click", () => {
  setMenu(!document.body.classList.contains("menu-open"));
});

document.addEventListener("click", (event) => {
  const isOpen = document.body.classList.contains("menu-open");
  const target = event.target;
  if (!isOpen || !(target instanceof Node)) return;
  if (nav?.contains(target) || toggle?.contains(target)) return;
  setMenu(false);
});

nav?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    setMenu(false);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setMenu(false);
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 920) {
    setMenu(false);
  }
});

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sanityProjectId = "qgyys6fw";
const sanityDataset = "production";
const sanityApiVersion = "2024-06-01";
const sanityApiHost = "api.sanity.io";

function sanityQueryUrl(query, params = {}) {
  const encodedParams = Object.entries(params)
    .map(([key, value]) => `&%24${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`)
    .join("");

  return `https://${sanityProjectId}.${sanityApiHost}/v${sanityApiVersion}/data/query/${sanityDataset}?query=${encodeURIComponent(query)}${encodedParams}`;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plainTextFromBlocks(blocks = []) {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((block) => block?._type === "block")
    .map((block) => (block.children || []).map((child) => child.text || "").join(""))
    .join(" ")
    .trim();
}

function renderRichText(blocks = []) {
  if (!Array.isArray(blocks)) return "";

  return blocks
    .map((block) => {
      if (block?._type === "image" || block?._type === "imageWithAlt") {
        const src = block.url || block.asset?.url;
        if (!src) return "";
        const alt = block.alt || block.caption || "";
        const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
        return `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">${caption}</figure>`;
      }

      if (block?._type !== "block") return "";

      const text = (block.children || [])
        .map((child) => {
          let value = escapeHtml(child.text || "");
          const marks = child.marks || [];
          if (marks.includes("strong")) value = `<strong>${value}</strong>`;
          if (marks.includes("em")) value = `<em>${value}</em>`;
          return value;
        })
        .join("");

      if (!text) return "";

      if (block.listItem) return `<li>${text}</li>`;

      const style = block.style || "normal";
      if (["h2", "h3", "h4"].includes(style)) return `<${style}>${text}</${style}>`;
      return `<p>${text}</p>`;
    })
    .join("");
}

function renderPageBuilder(blocks = []) {
  if (!Array.isArray(blocks)) return "";

  return blocks
    .map((block) => {
      if (!block) return "";

      if (block._type === "hero") {
        return `
          <section class="cms-block cms-hero-copy">
            ${block.badge ? `<p class="eyebrow">${escapeHtml(block.badge)}</p>` : ""}
            ${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}
            ${renderRichText(block.richText)}
            ${renderButtons(block.buttons)}
          </section>
        `;
      }

      if (block._type === "cta") {
        return `
          <section class="cms-block cms-cta">
            ${block.eyebrow ? `<p class="eyebrow">${escapeHtml(block.eyebrow)}</p>` : ""}
            ${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}
            ${renderRichText(block.richText)}
            ${renderButtons(block.buttons)}
          </section>
        `;
      }

      if (block._type === "featureCardsIcon") {
        return `
          <section class="cms-block">
            ${block.eyebrow ? `<p class="eyebrow">${escapeHtml(block.eyebrow)}</p>` : ""}
            ${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}
            ${renderRichText(block.richText)}
            <div class="page-cards">
              ${(block.cards || [])
                .map((card) => `<article class="page-card"><h3>${escapeHtml(card.title || "")}</h3>${renderRichText(card.richText)}</article>`)
                .join("")}
            </div>
          </section>
        `;
      }

      if (block._type === "imageLinkCards") {
        return `
          <section class="cms-block">
            ${block.eyebrow ? `<p class="eyebrow">${escapeHtml(block.eyebrow)}</p>` : ""}
            ${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}
            ${renderRichText(block.richText)}
            <div class="page-cards">
              ${(block.cards || []).map(renderImageLinkCard).join("")}
            </div>
          </section>
        `;
      }

      if (block._type === "faqAccordion") {
        return `
          <section class="cms-block faq">
            ${block.eyebrow ? `<p class="eyebrow">${escapeHtml(block.eyebrow)}</p>` : ""}
            ${block.title ? `<h2>${escapeHtml(block.title)}</h2>` : ""}
            ${block.subtitle ? `<p>${escapeHtml(block.subtitle)}</p>` : ""}
            ${(block.faqs || [])
              .map((faq, index) => `<details ${index === 0 ? "open" : ""}><summary>${escapeHtml(faq.title || "")}</summary>${renderRichText(faq.richText)}</details>`)
              .join("")}
          </section>
        `;
      }

      return "";
    })
    .join("");
}

function resolveLink(url) {
  if (!url) return "#";
  if (typeof url === "string") return url;
  if (url.type === "internal") {
    const current = url.internal?.slug?.current || url.internal?.slug || url.internalSlug;
    return normalizeHref(current);
  }
  return url.external || url.href || "#";
}

function normalizeHref(slug = "") {
  if (!slug || slug === "/") return "/";
  if (slug.startsWith("http") || slug.startsWith("#") || slug.startsWith("mailto:") || slug.startsWith("tel:")) return slug;
  const path = slug.startsWith("/") ? slug : `/${slug}`;
  return path.endsWith("/") ? path : `${path}/`;
}

function renderButtons(buttons = []) {
  if (!Array.isArray(buttons) || !buttons.length) return "";
  return `<div class="cms-buttons">${buttons
    .map((button) => `<a class="button ${button.variant === "outline" ? "ghost" : "primary"}" href="${escapeHtml(resolveLink(button.url))}">${escapeHtml(button.text || "Les mer")}</a>`)
    .join("")}</div>`;
}

function renderImageLinkCard(card) {
  const href = resolveLink(card.url);
  const image = card.image?.url ? `<img src="${escapeHtml(card.image.url)}" alt="${escapeHtml(card.image.alt || card.title || "")}" loading="lazy" decoding="async">` : "";
  return `<a class="page-card" href="${escapeHtml(href)}">${image}<h3>${escapeHtml(card.title || "")}</h3><p>${escapeHtml(card.description || "")}</p></a>`;
}

function getCurrentSlugCandidates() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments.at(-1) || "";
  const candidates = new Set([pathname, `${pathname}/`]);

  if (pathname === "/") {
    candidates.add("/");
  }

  if (lastSegment) {
    candidates.add(lastSegment);
    candidates.add(`/${lastSegment}`);
  }

  return Array.from(candidates);
}

function renderPdfDownloads(pdfFiles) {
  const validFiles = (pdfFiles || []).filter((file) => file?.url);
  if (!validFiles.length) return;

  const target =
    document.querySelector(".content-stack") ||
    document.querySelector(".page-content") ||
    document.querySelector("main");
  if (!target) return;

  const section = document.createElement("section");
  section.className = "pdf-downloads reveal";
  section.setAttribute("aria-label", "PDF-dokumenter");

  const title = document.createElement("h2");
  title.textContent = "Dokumenter";
  section.append(title);

  const list = document.createElement("div");
  list.className = "pdf-download-list";

  validFiles.forEach((file) => {
    const link = document.createElement("a");
    link.className = "pdf-download";
    link.href = file.url;
    link.target = "_blank";
    link.rel = "noopener";

    const label = document.createElement("strong");
    label.textContent = file.title || "Last ned PDF";
    link.append(label);

    if (file.description) {
      const description = document.createElement("span");
      description.textContent = file.description;
      link.append(description);
    }

    list.append(link);
  });

  section.append(list);
  target.append(section);

  if (reduceMotion) {
    section.classList.add("is-visible");
  } else {
    window.requestAnimationFrame(() => section.classList.add("is-visible"));
  }
}

function getContentQuery() {
  return `{
    "settings": *[_type == "settings"][0]{
      companyName, siteTitle, siteDescription, phone, contactEmail, address, socialLinks,
      "logoUrl": logo.asset->url
    },
    "navbar": *[_type == "navbar"][0]{
      columns[]{
        _type, name, title, description,
        url{type, external, internal->{_type, "slug": slug.current}},
        links[]{name, description, url{type, external, internal->{_type, "slug": slug.current}}}
      },
      buttons[]{text, variant, url{type, external, internal->{_type, "slug": slug.current}}}
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
        _type, internalTitle, title, description, summary, excerpt, category, publishedAt, "slug": slug.current,
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
      },
      *[$isNewsPath && _type == "newsPost" && slug.current in $slugs][0]{
        _type, internalTitle, title, description, summary, excerpt, category, publishedAt, "slug": slug.current,
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
      },
      *[_type in ["page", "service", "projectReference", "newsPost"] && slug.current in $slugs][0]{
        _type, internalTitle, title, description, summary, excerpt, category, publishedAt, "slug": slug.current,
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

async function loadSanityContent() {
  try {
    const pathname = window.location.pathname;
    const response = await fetch(sanityQueryUrl(getContentQuery(), {
      slugs: getCurrentSlugCandidates(),
      isReferencePath: pathname.startsWith("/referanser/") && pathname !== "/referanser/",
      isNewsPath: /^\/\d{4}\/\d{2}\/\d{2}\//.test(pathname),
    }), {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    applySanityContent(payload?.result || {});
  } catch {
    // Keep the static HTML as fallback if Sanity is unavailable.
  }
}

function applySanityContent(data) {
  applyGlobalContent(data);
  applyCurrentDocument(data);
  applyLists(data);
  renderPdfDownloads(data.document?.pdfFiles);
  refreshRevealItems();
}

function applyGlobalContent({ settings, navbar, footer }) {
  if (settings?.siteTitle && document.title.includes("Fiskum")) {
    const h1 = document.querySelector("h1")?.textContent?.trim();
    document.title = h1 && h1 !== settings.siteTitle ? `${h1} - ${settings.companyName || settings.siteTitle}` : settings.siteTitle;
  }

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription && settings?.siteDescription && window.location.pathname === "/") {
    metaDescription.setAttribute("content", settings.siteDescription);
  }

  document.querySelectorAll(".brand img, .footer-brand img").forEach((image) => {
    if (settings?.logoUrl) image.setAttribute("src", settings.logoUrl);
    image.setAttribute("alt", settings?.companyName || "Fiskum Plate og Sveiseverksted AS");
  });

  document.querySelectorAll(".brand span").forEach((brandText) => {
    if (settings?.companyName) brandText.innerHTML = escapeHtml(settings.companyName).replace(" &amp; ", " &amp;<br>");
  });

  const nav = document.querySelector("#primary-nav");
  const navLinks = flattenNavigation(navbar?.columns);
  if (nav && navLinks.length) {
    nav.innerHTML = navLinks
      .map((item) => `<a${item.isCta ? ' class="nav-cta"' : ""} href="${escapeHtml(resolveLink(item.url))}">${escapeHtml(item.name || "")}</a>`)
      .join("");
  }

  const footerBrandTitle = document.querySelector(".footer-brand h2");
  if (footerBrandTitle && footer?.subtitle) footerBrandTitle.textContent = footer.subtitle;

  const footerColumns = document.querySelector(".footer-columns");
  if (footerColumns && settings) {
    footerColumns.innerHTML = `
      <div><strong>Telefon</strong><span>Ring oss gjerne:</span><a href="tel:${escapeHtml((settings.phone || "").replaceAll(" ", ""))}">${escapeHtml(settings.phone || "")}</a></div>
      <div><strong>E-post</strong><span>Send e-post:</span><a href="mailto:${escapeHtml(settings.contactEmail || "")}">${escapeHtml(settings.contactEmail || "")}</a></div>
      <address><strong>Adresse</strong>${escapeHtml(settings.address?.street || "")}<br>${escapeHtml([settings.address?.postalCode, settings.address?.city].filter(Boolean).join(" "))}<br>${escapeHtml(settings.address?.country || "")}</address>
      <div><strong>Følg oss</strong>${settings.socialLinks?.facebook ? `<a class="social-link" href="${escapeHtml(settings.socialLinks.facebook)}" aria-label="Facebook">f</a>` : ""}</div>
    `;
  }

  const footerNav = document.querySelector(".footer-bottom nav");
  if (footerNav && navLinks.length) {
    footerNav.innerHTML = navLinks
      .map((item) => `<a href="${escapeHtml(resolveLink(item.url))}">${escapeHtml(item.name || "")}</a>`)
      .join("");
  }
}

function flattenNavigation(columns = []) {
  const items = [];
  columns.forEach((item) => {
    if (item?._type === "navbarLink") items.push(item);
    if (Array.isArray(item?.links)) items.push(...item.links);
  });

  return items.map((item) => ({
    name: item.name,
    url: item.url,
    isCta: /kontakt/i.test(item.name || ""),
  }));
}

function applyCurrentDocument({ document: doc }) {
  if (!doc) return;

  const title = doc.title || doc.internalTitle;
  const description = doc.description || doc.summary || doc.excerpt || plainTextFromBlocks(doc.body) || plainTextFromBlocks(doc.richText);

  const h1 = document.querySelector("h1");
  if (h1 && title) h1.textContent = title;

  const currentBreadcrumb = document.querySelector('.breadcrumbs [aria-current="page"]');
  if (currentBreadcrumb && title) currentBreadcrumb.textContent = title;

  const heroDescription = document.querySelector(".page-hero > p:not(.eyebrow), .article-hero > p:not(.eyebrow)");
  if (heroDescription && description) heroDescription.textContent = description;

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription && description) metaDescription.setAttribute("content", description);

  if (title) document.title = `${title} - Fiskum Plate og Sveiseverksted AS`;

  if (window.location.pathname === "/" && doc._type === "homePage") {
    applyHomePage(doc);
    return;
  }

  const contentStack = document.querySelector(".content-stack");
  if (!contentStack) return;

  const bodyHtml = [
    renderRichText(doc.body),
    renderRichText(doc.richText),
    renderPageBuilder(doc.pageBuilder),
    renderGallery(doc.gallery),
  ].join("");

  if (bodyHtml.trim()) contentStack.innerHTML = bodyHtml;
}

function applyHomePage(doc) {
  const title = doc.title;
  const description = doc.description || plainTextFromBlocks(doc.pageBuilder?.[0]?.richText);

  const heroTitle = document.querySelector(".hero h1");
  const heroText = document.querySelector(".hero-copy > p:not(.eyebrow)");
  if (heroTitle && title) heroTitle.textContent = title;
  if (heroText && description) heroText.textContent = description;

  const pageBuilderHtml = renderPageBuilder(doc.pageBuilder);
  if (pageBuilderHtml.trim()) {
    const intro = document.querySelector(".intro");
    if (intro) intro.innerHTML = pageBuilderHtml;
  }
}

function renderGallery(gallery = []) {
  const images = (gallery || []).filter((image) => image?.url);
  if (!images.length) return "";
  return `<div class="gallery">${images
    .map((image) => `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || image.caption || "")}" loading="lazy" decoding="async">`)
    .join("")}</div>`;
}

function applyLists({ services = [], references = [], newsPosts = [], faqs = [], settings }) {
  const serviceItems = services.filter((service) => service.slug);
  const referenceItems = references.filter((reference) => reference.slug);
  const newsItems = newsPosts.filter((post) => post.slug);

  const serviceGrid = document.querySelector(".services");
  if (serviceGrid && serviceItems.length) {
    serviceGrid.innerHTML = serviceItems.map(renderServiceArticle).join("");
  }

  const serviceCards = document.querySelector(".page-cards");
  if (serviceCards && window.location.pathname.startsWith("/tjenester") && serviceItems.length) {
    serviceCards.innerHTML = serviceItems.map(renderServiceCard).join("");
  }

  const sidePanel = document.querySelector(".side-panel");
  if (sidePanel && window.location.pathname.startsWith("/tjenester") && serviceItems.length) {
    sidePanel.innerHTML = `<strong>Tjenester</strong>${serviceItems
      .map((service) => `<a href="${escapeHtml(normalizeHref(service.slug))}">${escapeHtml(service.title || service.internalTitle || "")}</a>`)
      .join("")}`;
  } else if (sidePanel && settings) {
    sidePanel.innerHTML = `
      <strong>Kontakt</strong>
      <a href="tel:${escapeHtml((settings.phone || "").replaceAll(" ", ""))}">${escapeHtml(settings.phone || "")}</a>
      <a href="mailto:${escapeHtml(settings.contactEmail || "")}">${escapeHtml(settings.contactEmail || "")}</a>
      <span>${escapeHtml([settings.address?.street, settings.address?.postalCode, settings.address?.city].filter(Boolean).join(", "))}</span>
    `;
  }

  const referenceList = document.querySelector(".reference-list");
  if (referenceList && referenceItems.length) {
    referenceList.innerHTML = referenceItems.map(renderReferenceCard).join("");
  }

  const newsGrid = document.querySelector(".news-grid");
  if (newsGrid && newsItems.length) {
    newsGrid.innerHTML = newsItems.slice(0, 2).map(renderNewsCard).join("");
  }

  const newsList = document.querySelector(".news-list");
  if (newsList && newsItems.length) {
    newsList.innerHTML = newsItems.map(renderNewsListItem).join("");
  }

  const faqSection = document.querySelector(".faq");
  if (faqSection && faqs.length && window.location.pathname === "/") {
    const heading = faqSection.querySelector(".section-heading")?.outerHTML || "";
    faqSection.innerHTML = `${heading}${faqs
      .map((faq, index) => `<details ${index === 0 ? "open" : ""}><summary>${escapeHtml(faq.title || "")}</summary>${renderRichText(faq.richText)}</details>`)
      .join("")}`;
  }
}

function renderServiceArticle(service) {
  const image = service.image?.url ? `<img src="${escapeHtml(service.image.url)}" alt="${escapeHtml(service.image.alt || "")}" loading="lazy" decoding="async">` : "";
  return `<article>${image}<h3>${escapeHtml(service.title || service.internalTitle || "")}</h3><p>${escapeHtml(service.summary || "")}</p></article>`;
}

function renderServiceCard(service) {
  return `<a class="page-card" href="${escapeHtml(normalizeHref(service.slug))}"><h3>${escapeHtml(service.title || service.internalTitle || "")}</h3><p>${escapeHtml(service.summary || "")}</p></a>`;
}

function renderReferenceCard(reference) {
  const href = `/referanser/${String(reference.slug || "").replace(/^\/+|\/+$/g, "")}/`;
  const image = reference.image?.url ? `<img src="${escapeHtml(reference.image.url)}" alt="${escapeHtml(reference.image.alt || reference.title || "")}" loading="lazy" decoding="async">` : "";
  return `<a class="reference-card" href="${escapeHtml(href)}">${image}<span>Referanse</span><h3>${escapeHtml(reference.title || reference.internalTitle || "")}</h3><p>${escapeHtml(reference.summary || "")}</p></a>`;
}

function renderNewsCard(post) {
  const href = normalizeNewsHref(post);
  const image = post.image?.url ? `<img src="${escapeHtml(post.image.url)}" alt="${escapeHtml(post.image.alt || post.title || "")}" loading="lazy" decoding="async">` : "";
  return `<a class="news-card" href="${escapeHtml(href)}">${image}<div><p>${escapeHtml(formatDate(post.publishedAt))}</p><h3>${escapeHtml(post.title || post.internalTitle || "")}</h3></div></a>`;
}

function renderNewsListItem(post) {
  const href = normalizeNewsHref(post);
  return `<a class="news-list-item" href="${escapeHtml(href)}"><span>${escapeHtml(formatDate(post.publishedAt))}</span><h2>${escapeHtml(post.title || post.internalTitle || "")}</h2><p>${escapeHtml(post.excerpt || "")}</p></a>`;
}

function normalizeNewsHref(post) {
  const slug = String(post.slug || "").replace(/^\/+|\/+$/g, "");
  if (!post.publishedAt) return `/${slug}/`;
  const date = new Date(post.publishedAt);
  if (Number.isNaN(date.getTime())) return `/${slug}/`;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `/${year}/${month}/${day}/${slug}/`;
}

function formatDate(dateValue) {
  if (!dateValue) return "";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

const revealSelectors = [
  ".page-hero > *",
  ".hero-copy > *",
  ".hero-strip a",
  ".intro > *",
  ".services article",
  ".split > *",
  ".process-grid > *",
  ".check-list li",
  ".news-grid > *",
  ".news-list-item",
  ".quote-grid > *",
  ".contact > *",
  ".footer-brand",
  ".footer-columns > *",
  ".footer-bottom",
  ".page-grid > *",
  ".page-card",
  ".reference-card",
  ".pdf-downloads",
  ".gallery img",
].join(",");

const revealItems = Array.from(document.querySelectorAll(revealSelectors));
const firstSectionAfterHero = document.querySelector(".hero + .section");
const immediateRevealItems = revealItems.filter((item) => firstSectionAfterHero?.contains(item));
const standardRevealItems = revealItems.filter((item) => !firstSectionAfterHero?.contains(item));

revealItems.forEach((item) => {
  item.classList.add("reveal");
});

standardRevealItems.forEach((item, index) => {
  item.style.setProperty("--reveal-delay", `${Math.min(index % 8, 7) * 55}ms`);
});

immediateRevealItems.forEach((item) => {
  item.style.setProperty("--reveal-delay", "0ms");
});

if (reduceMotion) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else if ("IntersectionObserver" in window) {
  const revealVisible = (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  };

  const standardObserver = new IntersectionObserver(
    (entries, observer) => revealVisible(entries, observer),
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  const immediateObserver = new IntersectionObserver(
    (entries, observer) => revealVisible(entries, observer),
    { rootMargin: "0px", threshold: 0 }
  );

  standardRevealItems.forEach((item) => standardObserver.observe(item));
  immediateRevealItems.forEach((item) => immediateObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}

function refreshRevealItems() {
  const items = Array.from(document.querySelectorAll(revealSelectors));
  items.forEach((item) => {
    item.classList.add("reveal");
    if (!item.classList.contains("is-visible")) {
      item.classList.add("is-visible");
    }
  });
}

const heroSlides = Array.from(document.querySelectorAll(".hero-slide"));
const heroDots = Array.from(document.querySelectorAll(".hero-dots button"));
let heroIndex = 0;
let heroTimer;

function hydrateHeroSlide(index) {
  const image = heroSlides[index]?.querySelector("img[data-src]");
  if (!image) return;
  image.src = image.dataset.src;
  image.removeAttribute("data-src");
}

function setHeroSlide(index) {
  if (!heroSlides.length) return;
  heroIndex = (index + heroSlides.length) % heroSlides.length;
  hydrateHeroSlide(heroIndex);

  heroSlides.forEach((slide, slideIndex) => {
    slide.classList.toggle("is-active", slideIndex === heroIndex);
    if (slideIndex !== heroIndex) {
      slide.querySelector("img")?.style.removeProperty("transform");
    }
  });

  heroDots.forEach((dot, dotIndex) => {
    const active = dotIndex === heroIndex;
    dot.classList.toggle("is-active", active);
    dot.setAttribute("aria-current", active ? "true" : "false");
  });

  updateHeroMotion();
}

function startHeroSlider() {
  if (reduceMotion || heroSlides.length < 2) return;
  window.clearInterval(heroTimer);
  heroTimer = window.setInterval(() => setHeroSlide(heroIndex + 1), 5600);
}

heroDots.forEach((dot, index) => {
  dot.addEventListener("click", () => {
    setHeroSlide(index);
    startHeroSlider();
  });
});

let ticking = false;

function updateHeroMotion() {
  ticking = false;
  const activeImage = document.querySelector(".hero-slide.is-active img");
  if (!activeImage || reduceMotion || window.innerWidth < 720) return;
  const offset = Math.min(window.scrollY * 0.05, 28);
  activeImage.style.transform = `scale(1.06) translateY(${offset}px)`;
}

if (heroSlides.length) {
  setHeroSlide(0);
  startHeroSlider();
  window.setTimeout(() => {
    hydrateHeroSlide(1);
  }, 900);
}

if (heroSlides.length && !reduceMotion) {
  updateHeroMotion();
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateHeroMotion);
    },
    { passive: true }
  );
}

document.addEventListener("submit", (event) => {
  if (!(event.target instanceof HTMLFormElement) || !event.target.matches(".contact-form")) return;
  if (event.target.action) return;
  event.preventDefault();
  alert("Skjemaet er ikke konfigurert for sending enda.");
});

loadSanityContent();
