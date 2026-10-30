// Keep the published renderer and authorized preview on the same field contract.
export const imageProjection = `alt, caption, crop, hotspot, "url": asset->url, asset->{url, metadata{dimensions{width,height}}}`;
export const linkProjection = `type, external, href, openInNewTab, internal->{_id, _type, "slug": slug.current, publishedAt}`;
export const portableProjection = `..., markDefs[]{..., customLink{${linkProjection}}}, crop, hotspot, asset->{url, metadata{dimensions{width,height}}}`;
export const identityProjection = `_id, _type, "slug": slug.current, publishedAt, seoNoIndex, _createdAt`;
export const sharedFields = `_id, _type, internalTitle, title, description, heroLead, summary, excerpt, publishedAt, icon, galleryEyebrow, galleryTitle, seoTitle, seoDescription, seoNoIndex, ogTitle, ogDescription, "slug": slug.current,
  image{${imageProjection}}, seoImage{${imageProjection}}, mainImage{${imageProjection}},
  body[]{${portableProjection}}, richText[]{${portableProjection}},
  gallery[]{${imageProjection}}, heroImages[]{${imageProjection}},
  pageBuilder[]{..., image{${imageProjection}}, richText[]{${portableProjection}},
    cards[]{..., image{${imageProjection}}, richText[]{${portableProjection}}, url{${linkProjection}}},
    faqs[]->{title, richText[]{${portableProjection}}},
    buttons[]{text, variant, url{${linkProjection}}}},
  contactDetails{bankName, bankAccount, organizationNumber},
  contactPeople[]{_key, name, role, phone, email}, sideQuote{quote, author, company},
  "pdfFiles": pdfFiles[]{title, description, "url": file.asset->url}`;
export const settingsProjection = `companyName, siteTitle, siteDescription, phone, contactEmail, contactFormEnabled, address, socialLinks, logo{${imageProjection}}, "logoUrl": logo.asset->url`;
export const navbarProjection = `columns[]{_type, name, title, url{${linkProjection}}, links[]{name, url{${linkProjection}}}}`;
export const footerProjection = `subtitle, copyrightText, developerCreditText, developerCreditUrl, columns[]{title, links[]{name, url{${linkProjection}}}}`;
export const faqProjection = `_id, title, richText[]{${portableProjection}}`;
export const redirectProjection = `_id, title, from, permanent, to{${linkProjection}}`;
export const documentProjection = `${sharedFields},
  _type in ["service", "projectReference"] => {"image": gallery[0]{${imageProjection}}},
  _type == "newsPost" => {"image": mainImage{${imageProjection}}}`;

export function contentQuery() {
  return `{
    "settings": *[_type == "settings"][0]{${settingsProjection}},
    "navbar": *[_type == "navbar"][0]{${navbarProjection}},
    "footer": *[_type == "footer"][0]{${footerProjection}},
    "homePage": *[_type == "homePage"][0]{${sharedFields}},
    "pages": *[_type == "page"] | order(_createdAt asc){${sharedFields}},
    "services": *[_type == "service"] | order(_createdAt asc){${sharedFields}, "image": gallery[0]{${imageProjection}}},
    "references": *[_type == "projectReference"] | order(_createdAt asc){${sharedFields}, category, "image": gallery[0]{${imageProjection}}},
    "newsPosts": *[_type == "newsPost"] | order(publishedAt desc){${sharedFields}, "image": mainImage{${imageProjection}}},
    "faqs": *[_type == "faq"] | order(_createdAt asc){${faqProjection}},
    "redirects": *[_type == "redirect"] | order(_createdAt asc){${redirectProjection}}
  }`;
}
