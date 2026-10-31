import { establishedServiceIcons } from "../lib/established-icons.mjs";
import { contentPath } from "../lib/content-path.ts";
import { socialImage } from "../lib/social-image.ts";
const routes = new Set([
  "homePage",
  "page",
  "service",
  "projectReference",
  "newsPost",
]);
const clone = (value) => structuredClone(value);
const blockKey = (prefix, index) => `${prefix}-${index}`;
export const globalSharingId =
  "image-737fc8d8206954864b424e56c284340aba6733e7-1900x665-webp";
const plain = (value) => (typeof value === "string" ? value.trim() : "");
const text = (blocks) =>
  (blocks ?? [])
    .filter((b) => b._type === "block")
    .map((b) => (b.children ?? []).map((s) => s.text ?? "").join(""))
    .join(" ")
    .trim();
const rich = (value, key) => [
  {
    _type: "block",
    _key: key,
    style: "normal",
    markDefs: [],
    children: [{ _type: "span", _key: "text", text: value, marks: [] }],
  },
];
function perspectiveDocuments(documents, draft) {
  const map = new Map(
    documents
      .filter((d) => !d._id.startsWith("drafts."))
      .map((d) => [d._id, d]),
  );
  if (draft)
    for (const d of documents.filter((d) => d._id.startsWith("drafts.")))
      map.set(d._id.slice(7), { ...d, _id: d._id.slice(7) });
  return [...map.values()];
}
function targetFromOld(url, documents) {
  if (url?.target) return clone(url.target);
  if (url?.type === "internal" && url.internal?._ref)
    return {
      _type: "linkTarget",
      kind: "internal",
      document: {
        _type: "reference",
        _ref: url.internal._ref.replace(/^drafts\./, ""),
      },
    };
  const href = plain(url?.external || url?.href);
  if (!href || href === "#") return null;
  if (href.startsWith("mailto:"))
    return { _type: "linkTarget", kind: "email", email: href.slice(7) };
  if (href.startsWith("tel:"))
    return { _type: "linkTarget", kind: "phone", phone: href.slice(4) };
  if (href.startsWith("#"))
    return { _type: "linkTarget", kind: "anchor", anchor: href.slice(1) };
  if (href.startsWith("/") || href.startsWith("https://www.fiskum-sveis.no/")) {
    const path = new URL(href, "https://www.fiskum-sveis.no").pathname.replace(
      /\/?$/,
      "/",
    );
    const doc = documents.find((d) => contentPath(d) === path);
    if (!doc) throw new Error(`Internal URL has no current document: ${href}`);
    return {
      _type: "linkTarget",
      kind: "internal",
      document: { _type: "reference", _ref: doc._id.replace(/^drafts\./, "") },
    };
  }
  if (/^https?:\/\//.test(href))
    return { _type: "linkTarget", kind: "external", url: href };
  throw new Error(`Review legacy link before migration: ${href}`);
}
function visitLinks(value, documents) {
  if (Array.isArray(value))
    return value.map((item) => visitLinks(item, documents));
  if (!value || typeof value !== "object") return value;
  const next = {};
  for (const [k, v] of Object.entries(value))
    next[k] = visitLinks(v, documents);
  if (
    value._type === "customUrl" ||
    (["internal", "external"].includes(value.type) &&
      ("external" in value || "internal" in value || "href" in value))
  ) {
    const target = targetFromOld(value, documents);
    if (target && !next.target) next.target = target;
  }
  return next;
}
function image(value, title, index = 0) {
  if (!value) return undefined;
  return {
    ...clone(value),
    _type: "imageWithAlt",
    _key: value._key || blockKey("image", index),
    alt:
      plain(value.alt) ||
      plain(value.caption) ||
      `${title} – bilde ${index + 1}`,
  };
}
function images(values, title) {
  return (values ?? []).map((value, index) => image(value, title, index));
}
function richText(values, title) {
  return (values ?? []).map((value, index) =>
    value._type === "image" || value._type === "imageWithAlt"
      ? { ...image(value, title, index), _type: value._type }
      : clone(value),
  );
}
function button(label, id, variant = "link") {
  return {
    _type: "button",
    _key: `link-${id}`,
    text: label,
    variant,
    url: {
      _type: "customUrl",
      target: {
        _type: "linkTarget",
        kind: "internal",
        document: { _type: "reference", _ref: id },
      },
    },
  };
}
function byPath(documents, path) {
  return documents.find((d) => contentPath(d) === path)?._id;
}
function builder(doc, documents) {
  let heroIndex = 0,
    ctaIndex = 0;
  return (doc.pageBuilder ?? []).map((original, index) => {
    const block = {
      ...clone(original),
      _key: original._key || blockKey("existing-section", index),
    };
    if (block._type === "hero" || block._type === "cta") {
      const current = block._type === "hero" ? heroIndex++ : ctaIndex++;
      block.layout =
        doc._type === "homePage"
          ? current === 0
            ? "services"
            : current === 1
              ? "proof"
              : "standard"
          : "standard";
      if (block.layout === "services") {
        const index = byPath(documents, "/tjenester/");
        if (index) block.serviceLink = button("Se alle tjenester", index);
      }
      if (block.layout === "proof") {
        const selected =
          block.image ||
          doc.heroImages?.[2] ||
          doc.heroImages?.[1] ||
          doc.heroImages?.[0];
        if (selected)
          block.image = image(
            selected,
            doc.title || doc.internalTitle || "Fiskum",
          );
      }
    }
    if (block.image)
      block.image = image(
        block.image,
        doc.title || doc.internalTitle || "Fiskum",
      );
    if (block.cards)
      block.cards = block.cards.map((card, index) => ({
        ...card,
        ...(card.image
          ? {
              image: image(
                card.image,
                card.title || doc.title || "Fiskum",
                index,
              ),
            }
          : {}),
      }));
    if (block.richText)
      block.richText = richText(
        block.richText,
        doc.title || doc.internalTitle || "Fiskum",
      );
    return visitLinks(block, documents);
  });
}
export function sectionsFor(doc, documents) {
  const title = doc.title || doc.internalTitle || "Fiskum";
  const sections = [];
  const services = documents.filter((d) => d._type === "service");
  const news = documents.filter((d) => d._type === "newsPost");
  const faqs = documents
    .filter((d) => d._type === "faq")
    .sort((a, b) => String(a._createdAt).localeCompare(String(b._createdAt)));
  if (doc._type === "homePage") {
    const contact = byPath(documents, "/kontakt-oss/");
    if (!contact) throw new Error("Missing established contact page.");
    sections.push({
      _type: "heroCarousel",
      _key: "existing-home-hero",
      title: doc.title,
      eyebrow: doc.description,
      lead: doc.heroLead,
      images: images(doc.heroImages || doc.gallery, title),
      buttons: [button("Send forespørsel", contact, "default")],
      useGlobalPhone: true,
      showServices: services.length > 0,
    });
  }
  if (doc.body?.length)
    sections.push({
      _type: "richTextSection",
      _key: "existing-body",
      richText: richText(doc.body, title),
    });
  if (doc.richText?.length)
    sections.push({
      _type: "richTextSection",
      _key: "existing-rich-text",
      richText: richText(doc.richText, title),
    });
  sections.push(...builder(doc, documents));
  if (doc.gallery?.length)
    sections.push({
      _type: "gallerySection",
      _key: "existing-gallery",
      eyebrow:
        doc._type === "projectReference"
          ? "Referanse"
          : contentPath(doc) === "/verksted/"
            ? doc.galleryEyebrow
            : "Galleri",
      title:
        doc._type === "projectReference"
          ? "Prosjektbilder"
          : contentPath(doc) === "/verksted/"
            ? doc.galleryTitle
            : "Bilder",
      images: images(doc.gallery, title),
    });
  if (doc.pdfFiles?.length)
    sections.push({
      _type: "pdfSection",
      _key: "existing-pdf-files",
      title: "Dokumenter",
      files: clone(doc.pdfFiles).map((file, index) => ({
        ...file,
        _key: file._key || blockKey("pdf", index),
      })),
    });
  if (doc.sideQuote)
    sections.push({
      _type: "quoteSection",
      _key: "existing-side-quote",
      placement: "sidebar",
      ...clone(doc.sideQuote),
    });
  const path = contentPath(doc);
  const collection =
    path === "/tjenester/"
      ? "service"
      : path === "/referanser/"
        ? "projectReference"
        : path === "/aktuelt/"
          ? "newsPost"
          : null;
  if (collection)
    sections.push({
      _type: "collectionSection",
      _key: "existing-context-list",
      placement: "afterContent",
      collection,
      layout: "index",
    });
  if (path === "/kontakt-oss/") {
    sections.push({
      _type: "contactInformation",
      _key: "existing-contact-information",
      placement: "afterContent",
      contactDetails: clone(doc.contactDetails || {}),
      contactPeople: clone(doc.contactPeople || []).map((person, index) => ({
        ...person,
        _key: person._key || blockKey("person", index),
      })),
    });
    sections.push({
      _type: "contactFormSection",
      _key: "existing-contact-form",
      placement: "afterContent",
    });
  }
  if (doc._type === "homePage") {
    if (news.length) {
      const index = byPath(documents, "/aktuelt/");
      sections.push({
        _type: "collectionSection",
        _key: "existing-home-news",
        collection: "newsPost",
        layout: "home",
        eyebrow: "Aktuelt",
        title: "Aktuelt",
        limit: 2,
        ...(index ? { moreLink: button("Se alle nyheter", index) } : {}),
      });
    }
    if (faqs.length)
      sections.push({
        _type: "faqAccordion",
        _key: "existing-home-faq",
        layout: "home",
        eyebrow: "FAQ",
        title: "Ofte stilte spørsmål",
        faqs: faqs.map((faq, index) => ({
          _key: blockKey("faq", index),
          _type: "reference",
          _ref: faq._id,
        })),
      });
  }
  return visitLinks(sections, documents);
}
function currentSharing(doc, assets) {
  const fallback = {
    _type: "image",
    asset: { _type: "reference", _ref: globalSharingId },
    alt: "Stålprosjekt fra Fiskum Plate og Sveiseverksted",
  };
  const candidateImage = ["service", "projectReference"].includes(doc._type)
    ? doc.gallery?.[0]
    : doc.image;
  const candidates = [
    doc.seoImage,
    doc.mainImage,
    candidateImage,
    doc.heroImages?.[0],
    doc.gallery?.[0],
    fallback,
  ];
  for (const candidate of candidates) {
    if (!candidate?.asset?._ref) continue;
    const asset = assets.find((asset) => asset._id === candidate.asset._ref);
    if (!asset) continue;
    const copy = {
      ...clone(candidate),
      _type: "image",
      alt:
        plain(candidate.alt) ||
        "Stål- og metallarbeid fra Fiskum Plate og Sveiseverksted",
    };
    if (socialImage({ ...copy, asset })) return copy;
  }
  throw new Error(`No valid existing sharing artwork for ${doc._id}`);
}
function pageSeo(doc, assets) {
  const visibleTitle = plain(doc.title) || plain(doc.internalTitle);
  const title =
    plain(doc.seoTitle) ||
    (doc._type === "projectReference"
      ? `Referanse: ${visibleTitle}`
      : visibleTitle);
  const description =
    plain(doc.seoDescription) ||
    plain(doc.description) ||
    plain(doc.summary) ||
    plain(doc.excerpt) ||
    text(doc.body) ||
    text(doc.richText);
  return {
    _type: "seo",
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(plain(doc.ogTitle) ? { ogTitle: doc.ogTitle } : {}),
    ...(plain(doc.ogDescription) ? { ogDescription: doc.ogDescription } : {}),
    image: currentSharing(doc, assets),
  };
}
function nestedLinkPatches(before, after, path = [], result = {}) {
  if (Array.isArray(before)) {
    before.forEach((value, index) =>
      nestedLinkPatches(value, after[index], [...path, index], result),
    );
    return result;
  }
  if (!before || typeof before !== "object") return result;
  if (!before.target && after.target) {
    const field = path
      .map((part, index) =>
        typeof part === "number" ? `[${part}]` : `${index ? "." : ""}${part}`,
      )
      .join("");
    result[`${field}.target`] = after.target;
  }
  for (const [k, v] of Object.entries(before))
    nestedLinkPatches(v, after[k], [...path, k], result);
  return result;
}
export function buildMigration(snapshot) {
  const { documents, assets } = snapshot;
  const mutations = [];
  const beforeAfter = [];
  for (const original of documents) {
    const context = perspectiveDocuments(
      documents,
      original._id.startsWith("drafts."),
    );
    const enhanced = visitLinks(clone(original), context);
    const setIfMissing = nestedLinkPatches(original, enhanced);
    if (routes.has(original._type)) {
      if (
        original._type === "service" &&
        !original.icon &&
        establishedServiceIcons[contentPath(original)]
      )
        setIfMissing.icon = {
          _type: "iconPicker",
          provider: "existing",
          name: `Existing${original._id.replaceAll("-", "")}`,
          svg: establishedServiceIcons[contentPath(original)],
        };
      if (original.intro === undefined)
        setIfMissing.intro =
          original.description ||
          original.summary ||
          original.excerpt ||
          text(original.body) ||
          text(original.richText) ||
          "";
      if (original.sections === undefined)
        setIfMissing.sections = sectionsFor(original, context);
      if (
        original.listingPage === undefined &&
        ["projectReference", "newsPost"].includes(original._type)
      ) {
        const index = byPath(
          context,
          original._type === "projectReference" ? "/referanser/" : "/aktuelt/",
        );
        if (index)
          setIfMissing.listingPage = { _type: "reference", _ref: index };
      }
      if (original.previousPaths === undefined) setIfMissing.previousPaths = [];
      if (original.sidebarVariant === undefined)
        setIfMissing.sidebarVariant = [
          "/stalbygg/",
          "/vegger/",
          "/broer/",
          "/trapper/",
        ].includes(contentPath(original))
          ? "services"
          : "contact";
      const seo = pageSeo(original, assets);
      if (original.seo === undefined) setIfMissing.seo = seo;
      else
        for (const [k, v] of Object.entries(seo))
          if (original.seo[k] === undefined) setIfMissing[`seo.${k}`] = v;
      if (original.mainImage?.asset && !original.mainImage.alt)
        setIfMissing["mainImage.alt"] =
          plain(original.title) || plain(original.internalTitle) || "Fiskum";
    }
    if (original._type === "settings") {
      if (original.siteName === undefined)
        setIfMissing.siteName = original.companyName || original.siteTitle;
      if (original.defaultSeo === undefined)
        setIfMissing.defaultSeo = {
          _type: "seoDefaults",
          title: original.siteTitle,
          description: original.siteDescription,
          image: {
            _type: "image",
            asset: { _type: "reference", _ref: globalSharingId },
            alt: "Stålprosjekt fra Fiskum Plate og Sveiseverksted",
          },
        };
    }
    if (!Object.keys(setIfMissing).length) continue;
    const after = clone(original);
    for (const [field, value] of Object.entries(setIfMissing)) {
      const parts = field.match(/[^.[\]]+/g);
      let pointer = after;
      for (const part of parts.slice(0, -1)) pointer = pointer[part];
      pointer[parts.at(-1)] = clone(value);
    }
    mutations.push({
      patch: { id: original._id, ifRevisionID: original._rev, setIfMissing },
    });
    beforeAfter.push({ id: original._id, before: original, after });
  }
  return {
    project: "qgyys6fw",
    dataset: "production",
    sourceQueriedAt: snapshot.queriedAt,
    mutations,
    documents: beforeAfter,
    policy:
      "Each live published/draft document is transformed independently. All original leaves and legacy array ordering/lengths remain unchanged; new URL targets may be added inside legacy objects; new sections/SEO/reference targets are additive and ignored by old production. Submissions and secrets excluded.",
  };
}
