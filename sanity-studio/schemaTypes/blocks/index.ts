import { cta } from "./cta";
import { faqAccordion } from "./faq-accordion";
import { featureCardsIcon } from "./feature-cards-icon";
import { hero } from "./hero";
import { imageLinkCards } from "./image-link-cards";
import { subscribeNewsletter } from "./subscribe-newsletter";
import { additionalSections, sectionSettings, layoutField } from "../sections";
import { defineField } from "sanity";

export const pageBuilderBlocks = [
  hero,
  cta,
  featureCardsIcon,
  faqAccordion,
  imageLinkCards,
  subscribeNewsletter,
  ...additionalSections,
].map((block) => ({
  ...block,
  fields: [
    ...block.fields.map((field) =>
      block.name === "hero" && field.name === "image"
        ? {
            ...field,
            type: "imageWithAlt",
            hidden: ({ parent }: { parent?: { layout?: string } }) =>
              parent?.layout !== "proof",
          }
        : field,
    ),
    ...(["hero", "cta"].includes(block.name)
      ? [
          layoutField,
          defineField({
            name: "serviceLink",
            title: "Lenke under tjenesteintro",
            type: "button",
            hidden: ({ parent }) => parent?.layout !== "services",
          }),
          ...(block.name === "cta"
            ? [
                defineField({
                  name: "image",
                  title: "Bilde i bilde/tekst-utforming",
                  type: "imageWithAlt",
                  hidden: ({ parent }) => parent?.layout !== "proof",
                }),
              ]
            : []),
        ]
      : []),
    ...(block.name === "faqAccordion"
      ? [
          defineField({
            name: "layout",
            title: "Utforming",
            type: "string",
            options: {
              list: [
                { title: "Eksisterende seksjon", value: "standard" },
                { title: "Forsidens FAQ", value: "home" },
              ],
            },
            initialValue: "standard",
          }),
        ]
      : []),
    ...sectionSettings,
  ],
}));
