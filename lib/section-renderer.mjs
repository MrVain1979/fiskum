import { sectionContract, checkedSectionType } from "./section-contract.ts";
import { stegaClean } from "@sanity/client/stega";
const clean = (value) => (typeof value === "string" ? stegaClean(value) : "");
export const renderedSectionTypes = Object.keys(sectionContract);
function controls(markup, section) {
  if (!markup) return "";
  const parts = markup.split(/(?<=<\/section>)(?=<section\b)/);
  return parts
    .map((part, index) =>
      part.replace(/^<([a-z]+)([^>]*)>/, (_, tag, attrs) => {
        const style = [];
        if (index === 0 && [0, 40, 80, 120, 160].includes(section.paddingTop))
          style.push(`padding-top:${section.paddingTop}px`);
        if (
          index === parts.length - 1 &&
          [0, 40, 80, 120, 160].includes(section.paddingBottom)
        )
          style.push(`padding-bottom:${section.paddingBottom}px`);
        if (clean(section.maxWidth) === "narrow") style.push("max-width:760px");
        if (clean(section.maxWidth) === "content")
          style.push("max-width:1180px");
        const background = clean(section.background);
        const classes = `cms-section${["white", "light", "dark"].includes(background) ? ` cms-background-${background}` : ""}`;
        attrs = /\bclass="/.test(attrs)
          ? attrs.replace(/class="([^"]*)"/, `class="$1 ${classes}"`)
          : `${attrs} class="${classes}"`;
        if (style.length) attrs += ` style="${style.join(";")}"`;
        const anchor = clean(section.anchor);
        if (index === 0 && /^[A-Za-z][A-Za-z0-9_-]*$/.test(anchor))
          attrs += ` id="${anchor}"`;
        const key = clean(section._key)
          .replaceAll("&", "&amp;")
          .replaceAll('"', "&quot;");
        return `<${tag}${attrs} data-section-key="${key}"${index ? ` data-section-part="${index}"` : ""}>`;
      }),
    )
    .join("");
}
export function renderSections(sections = [], context, helpers) {
  const { data, primaryHero = false } = context;
  let hasHero = false;
  const anchors = new Set();
  return (sections ?? [])
    .filter((section) => !section.hidden)
    .map((original) => {
      const section = { ...original };
      const anchor = clean(section.anchor);
      if (anchor && anchors.has(anchor)) delete section.anchor;
      else if (anchor) anchors.add(anchor);
      const e = helpers.escapeHtml,
        t = helpers.escapeText;
      let html = "";
      switch (checkedSectionType(section._type)) {
        case "hero":
        case "cta":
        case "featureCardsIcon":
        case "imageLinkCards":
        case "faqAccordion":
          html = helpers.renderLegacyBuilder([section], {
            ...context,
            services: data.services ?? [],
          });
          break;
        case "heroCarousel": {
          const first = primaryHero && !hasHero;
          hasHero = true;
          html = helpers.renderHero({
            ...data,
            document: {
              ...section,
              title: first
                ? helpers.visibleHeading(data.document, data.settings)
                : section.title,
              description: section.eyebrow,
              heroLead: section.lead,
              heroImages: section.images,
            },
            heroHeading: first ? "h1" : "h2",
            heroBreadcrumb:
              first && data.document._type !== "homePage"
                ? helpers.breadcrumbHtml(
                    {
                      ...data.document,
                      title: helpers.visibleHeading(
                        data.document,
                        data.settings,
                      ),
                    },
                    helpers.contentPath(data.document),
                  )
                : "",
            heroButtons: section.buttons,
            useGlobalPhone: section.useGlobalPhone,
            services: section.showServices ? (data.services ?? []) : [],
          });
          break;
        }
        case "richTextSection":
          html = `<div class="content-stack cms-rich-text">${section.title ? `<h2>${t(section.title)}</h2>` : ""}${helpers.renderBlocks(section.richText)}</div>`;
          break;
        case "gallerySection":
          html = helpers.renderGallery(section.images, {
            eyebrow: section.eyebrow,
            title: section.title,
          });
          break;
        case "pdfSection":
          html = helpers.renderPdfs(section.files, section.title);
          break;
        case "quoteSection":
          html = helpers.renderQuote(section);
          break;
        case "contactInformation":
          html = helpers.renderContactDetails(section, data.settings);
          break;
        case "contactFormSection":
          html = data.settings?.contactFormEnabled
            ? helpers.renderContactForm(data.settings, {
                ...section,
                preview: data.preview,
              })
            : "";
          break;
        case "collectionSection": {
          const kind = clean(section.collection);
          if (kind === "newsPost" && clean(section.layout) === "home") {
            const news = (data.newsPosts ?? []).slice(
              0,
              Number.isInteger(section.limit) ? section.limit : 2,
            );
            const more = section.moreLink
              ? helpers.renderButtons([section.moreLink], false, "news")
              : "";
            html = news.length
              ? `<section class="section news"><div class="section-heading">${section.eyebrow ? `<p class="eyebrow">${t(section.eyebrow)}</p>` : ""}${section.title ? `<h2>${t(section.title)}</h2>` : ""}</div><div class="news-grid">${news.map(helpers.renderNewsCard).join("")}</div>${more}</section>`
              : "";
          } else {
            const body = helpers.renderContextList(
              data,
              kind === "service"
                ? "/tjenester/"
                : kind === "projectReference"
                  ? "/referanser/"
                  : "/aktuelt/",
            );
            const heading =
              section.title || section.eyebrow
                ? `<div class="section-heading">${section.eyebrow ? `<p class="eyebrow">${t(section.eyebrow)}</p>` : ""}${section.title ? `<h2>${t(section.title)}</h2>` : ""}</div>`
                : "";
            const more = section.moreLink
              ? helpers.renderButtons([section.moreLink], false, "news")
              : "";
            html =
              heading || more
                ? `<section class="section">${heading}${body}${more}</section>`
                : body;
          }
          break;
        }
        case "subscribeNewsletter":
          html = `<section class="contact newsletter-section"><div class="contact-copy">${section.title ? `<h2>${t(section.title)}</h2>` : ""}${helpers.renderBlocks(section.subTitle)}${helpers.renderBlocks(section.helperText)}</div><form${data.preview ? ' data-preview-disabled="true"' : ""} class="contact-form newsletter-form" action="/api/forms/newsletter" method="POST" aria-label="Forespørsel om nyhetsbrev" data-success-message="Forespørselen om nyhetsbrev er mottatt av bedriften."><input type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" class="honeypot"><label>E-post<input type="email" name="email" autocomplete="email" required></label><label class="consent-label"><input type="checkbox" name="consent" value="yes" required>Jeg samtykker til at bedriften bruker e-postadressen min til å følge opp forespørselen om nyhetsbrev.</label><p class="form-status" role="status" aria-live="polite" hidden></p><button class="button primary" type="submit"${data.preview ? ' disabled aria-disabled="true"' : ""}>Send forespørsel om nyhetsbrev</button></form></section>`;
          break;
        default:
          throw new Error(
            `Mangler renderer for seksjonstype: ${clean(section._type)}`,
          );
      }
      return controls(html, section);
    })
    .join("");
}
