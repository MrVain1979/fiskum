import { defineArrayMember, defineField, defineType } from "sanity";
const title = defineField({ name: "title", title: "Tittel", type: "string" });
const eyebrow = defineField({
  name: "eyebrow",
  title: "Overtittel",
  type: "string",
});
const spacing = (name: string, title: string) =>
  defineField({
    name,
    title,
    type: "number",
    initialValue: 80,
    options: { list: [0, 40, 80, 120, 160] },
    validation: (r) =>
      r.custom(
        (v) =>
          v === undefined ||
          [0, 40, 80, 120, 160].includes(v) ||
          "Velg 0, 40, 80, 120 eller 160.",
      ),
  });
export const sectionSettings = [
  spacing("paddingTop", "Luft over"),
  spacing("paddingBottom", "Luft under"),
  defineField({
    name: "background",
    title: "Bakgrunn",
    type: "string",
    initialValue: "original",
    options: {
      list: [
        { title: "Opprinnelig design", value: "original" },
        { title: "Hvit", value: "white" },
        { title: "Lys grå", value: "light" },
        { title: "Mørk", value: "dark" },
      ],
    },
  }),
  defineField({
    name: "maxWidth",
    title: "Maks bredde",
    type: "string",
    options: {
      list: [
        { title: "Opprinnelig design", value: "original" },
        { title: "Smal", value: "narrow" },
        { title: "Innhold", value: "content" },
      ],
    },
    initialValue: "original",
  }),
  defineField({
    name: "hidden",
    title: "Skjul seksjon",
    type: "boolean",
    initialValue: false,
  }),
  defineField({
    name: "anchor",
    title: "Anker-ID",
    type: "string",
    validation: (r) =>
      r.regex(/^[A-Za-z][A-Za-z0-9_-]*$/, { name: "gyldig anker-ID" }),
  }),
  defineField({
    name: "placement",
    hidden: ({ document, parent }) =>
      document?._type === "homePage" || parent?._type === "heroCarousel",
    title: "Plassering",
    type: "string",
    description:
      "Innhold følger venstre innholdskolonne. Full bredde ligger under kolonnene. Sideboks brukes til sitater.",
    options: {
      list: [
        { title: "Innhold", value: "content" },
        { title: "Under innholdskolonnene", value: "afterContent" },
        { title: "Sideboks", value: "sidebar" },
      ],
    },
    initialValue: "content",
  }),
];
export const layoutField = defineField({
  name: "layout",
  title: "Utforming",
  type: "string",
  initialValue: "standard",
  options: {
    list: [
      { title: "Opprinnelig tekstseksjon", value: "standard" },
      { title: "Tjenesteintro og tjenestekort", value: "services" },
      { title: "Bilde og begrunnelse", value: "proof" },
    ],
  },
});
export const heroCarousel = defineType({
  name: "heroCarousel",
  title: "Stor bildetopp med bildefremvisning",
  type: "object",
  fields: [
    title,
    eyebrow,
    defineField({ name: "lead", title: "Undertekst", type: "text", rows: 3 }),
    defineField({
      name: "images",
      title: "Bilder",
      type: "array",
      of: [defineArrayMember({ type: "imageWithAlt" })],
    }),
    defineField({
      name: "buttons",
      title: "Knapper",
      type: "array",
      of: [defineArrayMember({ type: "button" })],
    }),
    defineField({
      name: "showServices",
      title: "Vis felles tjenestestripe",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "useGlobalPhone",
      title: "Vis global telefonknapp",
      type: "boolean",
      initialValue: false,
    }),
  ],
  preview: {
    select: { title: "title", media: "images.0" },
    prepare: (v) => ({ ...v, subtitle: "Bildetopp og bildefremvisning" }),
  },
});
export const richTextSection = defineType({
  name: "richTextSection",
  title: "Vanlig sidetekst",
  type: "object",
  fields: [
    title,
    defineField({ name: "richText", title: "Brødtekst", type: "richText" }),
  ],
  preview: {
    select: { title: "title" },
    prepare: (v) => ({ ...v, title: v.title || "Vanlig sidetekst" }),
  },
});
export const gallerySection = defineType({
  name: "gallerySection",
  title: "Bildegalleri med bildevisning",
  type: "object",
  fields: [
    eyebrow,
    title,
    defineField({
      name: "images",
      title: "Bilder",
      type: "array",
      of: [defineArrayMember({ type: "imageWithAlt" })],
    }),
  ],
  preview: {
    select: { title: "title", media: "images.0" },
    prepare: (v) => ({ ...v, title: v.title || "Galleri" }),
  },
});
export const pdfSection = defineType({
  name: "pdfSection",
  title: "PDF-dokumenter",
  type: "object",
  fields: [
    title,
    defineField({
      name: "files",
      title: "Filer",
      type: "array",
      of: [defineArrayMember({ type: "pdfFile" })],
    }),
  ],
  preview: {
    select: { title: "title" },
    prepare: (v) => ({ ...v, title: v.title || "PDF-dokumenter" }),
  },
});
export const collectionSection = defineType({
  name: "collectionSection",
  title: "Felles tjenester, referanser eller nyheter",
  type: "object",
  fields: [
    eyebrow,
    title,
    defineField({
      name: "collection",
      title: "Innholdskilde",
      type: "string",
      options: {
        list: [
          { title: "Tjenester", value: "service" },
          { title: "Referanser", value: "projectReference" },
          { title: "Aktuelt", value: "newsPost" },
        ],
      },
      validation: (r) => r.required(),
      description:
        "Bruker de samme publiserte dokumentene som nettstedets samlesider. Redigering av et dokument gjelder alle forekomster.",
    }),
    defineField({
      name: "layout",
      title: "Utforming",
      type: "string",
      options: {
        list: [
          { title: "Opprinnelig samleside", value: "index" },
          { title: "Nyhetskort fra forsiden", value: "home" },
        ],
      },
      initialValue: "index",
      hidden: ({ parent }) => parent?.collection !== "newsPost",
    }),
    defineField({
      name: "limit",
      title: "Antall",
      type: "number",
      initialValue: 2,
      hidden: ({ parent }) =>
        parent?.collection !== "newsPost" || parent?.layout !== "home",
      validation: (r) => r.integer().min(1).max(50),
    }),
    defineField({
      name: "moreLink",
      title: "Lenke til hele samlingen",
      type: "button",
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "collection" },
    prepare: (v) => ({ ...v, title: v.title || "Felles innhold" }),
  },
});
export const quoteSection = defineType({
  name: "quoteSection",
  title: "Kundesitat fra sideboksen",
  type: "object",
  fields: [
    defineField({ name: "quote", title: "Sitat", type: "text", rows: 4 }),
    defineField({ name: "author", title: "Navn", type: "string" }),
    defineField({ name: "company", title: "Firma", type: "string" }),
  ],
  preview: {
    select: { title: "quote" },
    prepare: (v) => ({ ...v, subtitle: "Kundesitat" }),
  },
});
export const contactInformation = defineType({
  name: "contactInformation",
  title: "Bedriftsopplysninger og kontaktpersoner",
  type: "object",
  fields: [
    defineField({
      name: "contactDetails",
      title: "Bedriftsopplysninger",
      type: "object",
      fields: ["bankName", "bankAccount", "organizationNumber"].map((name) =>
        defineField({
          name,
          title: (
            {
              bankName: "Bankforbindelse",
              bankAccount: "Bankgiro",
              organizationNumber: "Foretaksnummer",
            } as Record<string, string>
          )[name],
          type: "string",
        }),
      ),
    }),
    defineField({
      name: "contactPeople",
      title: "Kontaktpersoner",
      type: "array",
      of: [
        defineArrayMember({
          type: "object",
          name: "contactPerson",
          fields: [
            defineField({
              name: "name",
              title: "Navn",
              type: "string",
              validation: (r) => r.required(),
            }),
            defineField({ name: "role", title: "Rolle", type: "string" }),
            defineField({ name: "phone", title: "Telefon", type: "string" }),
            defineField({
              name: "email",
              title: "E-post",
              type: "string",
              validation: (r) => r.email(),
            }),
          ],
        }),
      ],
    }),
  ],
  preview: {
    prepare: () => ({ title: "Bedriftsopplysninger og kontaktpersoner" }),
  },
});
export const contactFormSection = defineType({
  name: "contactFormSection",
  title: "Eksisterende kontaktskjema",
  type: "object",
  description:
    "Bruker samme sikre innboks og global Vis kontaktskjema-innstilling som kontaktsiden.",
  fields: [
    title,
    defineField({ name: "lead", title: "Innledning", type: "text" }),
  ],
  preview: { prepare: () => ({ title: "Kontaktskjema" }) },
});
export const additionalSections = [
  heroCarousel,
  richTextSection,
  gallerySection,
  pdfSection,
  collectionSection,
  quoteSection,
  contactInformation,
  contactFormSection,
];
