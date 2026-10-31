import type { PageBuilder } from "../sanity.types";
// The catalogue is generated from the real schema. A new schema member must gain a renderer.
export const sectionContract = {
  hero: true,
  cta: true,
  featureCardsIcon: true,
  imageLinkCards: true,
  faqAccordion: true,
  subscribeNewsletter: true,
  heroCarousel: true,
  richTextSection: true,
  gallerySection: true,
  pdfSection: true,
  collectionSection: true,
  quoteSection: true,
  contactInformation: true,
  contactFormSection: true,
} satisfies Record<PageBuilder[number]["_type"], true>;

export function checkedSectionType(type: PageBuilder[number]["_type"]) {
  switch (type) {
    case "hero":
    case "cta":
    case "featureCardsIcon":
    case "imageLinkCards":
    case "faqAccordion":
    case "subscribeNewsletter":
    case "heroCarousel":
    case "richTextSection":
    case "gallerySection":
    case "pdfSection":
    case "collectionSection":
    case "quoteSection":
    case "contactInformation":
    case "contactFormSection":
      return type;
    default: {
      const missing: never = type;
      throw new Error("Seksjonstypen mangler renderer: " + missing);
    }
  }
}
