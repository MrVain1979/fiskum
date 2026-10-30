import { stegaClean } from "@sanity/client/stega";
import { socialImage } from "./social-image.ts";
import { resolveSanityImage } from "./image.ts";
import {
  canonicalOverride,
  productionOrigin,
  contentPath,
} from "./content-path.ts";
import { isPreviewDeployment } from "./site-config.mjs";
export const metadataText = (...values) =>
  values
    .map((value) =>
      typeof value === "string"
        ? stegaClean(value).trim().replace(/\s+/g, " ")
        : "",
    )
    .find(Boolean) || "";
export function requireSettings(settings) {
  if (
    !settings ||
    !metadataText(settings.siteName) ||
    !metadataText(settings.defaultSeo?.title) ||
    !metadataText(settings.defaultSeo?.description) ||
    !socialImage(settings.defaultSeo?.image)
  )
    throw new Error(
      "Publiser gyldig nettstedsnavn og globale SEO-standarder med et 1200 × 630-delingsbilde i Sideinnstillinger.",
    );
  return settings;
}
export function visibleHeading(doc, settings = {}) {
  const first = doc?.sections?.find((section) => !section.hidden);
  return (
    [
      first?._type === "heroCarousel" ? first.title : undefined,
      doc?.title,
      settings.defaultSeo?.title,
      settings.siteName,
    ].find((value) => metadataText(value)) || ""
  );
}
export function pageMetaTitle(doc, settings = {}) {
  const visible = visibleHeading(doc, settings);
  return (
    metadataText(doc?.seo?.title) ||
    metadataText(
      doc?._type === "projectReference"
        ? `Referanse: ${metadataText(visible)}`
        : visible,
    )
  );
}
const bodyText = (doc) =>
  (doc?.sections ?? [])
    .filter((section) => !section.hidden)
    .flatMap((section) => section.richText ?? [])
    .filter((block) => block._type === "block")
    .map((block) =>
      (block.children ?? []).map((span) => span.text ?? "").join(""),
    )
    .join(" ");
export function pageMetadata(data, path, { preview = false } = {}) {
  preview ||= isPreviewDeployment();
  const doc = data.document;
  const settings = requireSettings(data.settings);
  const baseTitle = metadataText(
    pageMetaTitle(doc, settings),
    settings.defaultSeo.title,
  );
  const company = metadataText(settings.companyName, settings.siteName);
  const title =
    company &&
    !baseTitle.toLocaleLowerCase("nb").includes(company.toLocaleLowerCase("nb"))
      ? `${baseTitle} - ${company}`
      : baseTitle;
  const description = metadataText(
    doc?.seo?.description,
    doc?.intro,
    doc?.summary,
    doc?.excerpt,
    bodyText(doc),
    settings.defaultSeo.description,
  );
  const image =
    socialImage(doc?.seo?.image) || socialImage(settings.defaultSeo.image);
  const override = canonicalOverride(doc?.seo?.canonical);
  if (override.error) throw new Error(override.error);
  const canonical = override.url || new URL(path, productionOrigin).href;
  return {
    metadataBase: new URL(productionOrigin),
    title,
    description,
    alternates: { canonical: preview ? undefined : canonical },
    openGraph: {
      type: doc?._type === "newsPost" ? "article" : "website",
      ...(doc?._type === "newsPost"
        ? {
            publishedTime: metadataText(doc.publishedAt) || undefined,
            modifiedTime: metadataText(doc._updatedAt) || undefined,
          }
        : {}),
      locale: "nb_NO",
      siteName: metadataText(settings.siteName),
      title: metadataText(doc?.seo?.ogTitle, baseTitle),
      description: metadataText(doc?.seo?.ogDescription, description),
      url: canonical,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    robots: preview
      ? { index: false, follow: false }
      : doc?.seoNoIndex
        ? { index: false, follow: true }
        : { index: true, follow: true },
  };
}
export function organizationJsonLd(settings) {
  requireSettings(settings);
  const logo = resolveSanityImage(settings.logo);
  const address = settings.address;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${productionOrigin}/#organization`,
    name: metadataText(settings.companyName, settings.siteName),
    url: productionOrigin,
    description: metadataText(settings.defaultSeo.description),
    logo: logo?.src,
    image: socialImage(settings.defaultSeo.image)?.url,
    telephone: metadataText(settings.phone) || undefined,
    email: metadataText(settings.contactEmail) || undefined,
    address: address
      ? {
          "@type": "PostalAddress",
          streetAddress: metadataText(address.street),
          postalCode: metadataText(address.postalCode),
          addressLocality: metadataText(address.city),
          addressCountry: metadataText(address.country),
        }
      : undefined,
    sameAs: Object.values(settings.socialLinks ?? {})
      .filter((value) => {
        try {
          return ["https:", "http:"].includes(
            new URL(metadataText(value)).protocol,
          );
        } catch {
          return false;
        }
      })
      .map((value) => metadataText(value)),
  };
}

export function breadcrumbTrail(doc, title) {
  if (doc?._type === "homePage") return [];
  const ancestors = [doc.listingPage, doc.parent?.parent, doc.parent].filter(
    Boolean,
  );
  return [
    { title: "Forsiden", path: "/" },
    ...ancestors.map((parent) => ({
      title: parent.navigationTitle || parent.title || "",
      path: contentPath(parent),
    })),
    { title, path: contentPath(doc) },
  ].filter((entry) => entry.path);
}
export function pageJsonLd(data, path, { preview = false } = {}) {
  const { document: doc, settings } = data,
    metadata = pageMetadata(data, path, { preview });
  const url = metadata.openGraph.url,
    title = metadataText(visibleHeading(doc, settings));
  const page = {
    "@context": "https://schema.org",
    "@type": doc._type === "newsPost" ? "Article" : "WebPage",
    "@id": url + "#webpage",
    url,
    ...(doc._type === "newsPost"
      ? {
          headline: title,
          datePublished: metadataText(doc.publishedAt) || undefined,
          dateModified: metadataText(doc._updatedAt) || undefined,
          mainEntityOfPage: url,
        }
      : { name: title }),
    description: metadata.description,
    image: metadata.openGraph.images[0]?.url,
    publisher: { "@id": productionOrigin + "/#organization" },
  };
  const trail = breadcrumbTrail(doc, title);
  return trail.length
    ? [
        page,
        {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "@id": url + "#breadcrumbs",
          itemListElement: trail.map((entry, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: metadataText(entry.title),
            item: new URL(entry.path, productionOrigin).href,
          })),
        },
      ]
    : [page];
}
export const serializeJsonLd = (value) =>
  JSON.stringify(value).replace(/</g, "\\u003c");
