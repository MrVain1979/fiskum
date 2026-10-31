import { defineField, defineType, type ValidationContext } from "sanity";
import { canonicalOverride } from "../../lib/content-path.ts";
import { socialImage, socialImageAccept } from "../../lib/social-image.ts";
import type { SanityImageData } from "../../lib/image.ts";
export async function validateSocialImage(
  value: SanityImageData | undefined,
  context: ValidationContext,
) {
  if (!value?.asset?._ref) return true;
  const asset = await context
    .getClient({ apiVersion: "2025-06-01" })
    .withConfig({ perspective: "raw", useCdn: false })
    .fetch("*[_id==$id][0]{_id,url,mimeType,metadata{dimensions}}", {
      id: value.asset._ref,
    });
  return socialImage({ ...value, asset })
    ? true
    : "Bruk et støttet rasterbilde med alt-tekst, gyldig crop/hotspot og minst 1200 × 630 piksler etter crop.";
}
const fields = (required: boolean) => [
  defineField({
    name: "title",
    title: "Metatittel",
    type: "string",
    validation: (r) => [
      r.custom(
        (value) =>
          !required || Boolean(value?.trim()) || "Fyll inn global metatittel.",
      ),
      r.max(60).warning("Anbefalt lengde er opptil 60 tegn."),
    ],
  }),
  defineField({
    name: "description",
    title: "Metabeskrivelse",
    type: "text",
    rows: 3,
    validation: (r) => [
      r.custom(
        (value) =>
          !required ||
          Boolean(value?.trim()) ||
          "Fyll inn global metabeskrivelse.",
      ),
      r.max(160).warning("Anbefalt lengde er normalt 150–160 tegn."),
    ],
  }),
  defineField({
    name: "image",
    title: "Delingsbilde",
    type: "image",
    options: { hotspot: true, accept: socialImageAccept },
    fields: [
      defineField({
        name: "alt",
        title: "Alternativ tekst",
        type: "string",
        validation: (r) =>
          r.custom((v, c) =>
            (c.parent as SanityImageData)?.asset && !v?.trim()
              ? "Beskriv delingsbildet."
              : true,
          ),
      }),
    ],
    validation: (r) => [
      ...(required ? [r.required().assetRequired()] : []),
      r.custom(validateSocialImage),
    ],
  }),
];
export const seoDefaults = defineType({
  name: "seoDefaults",
  title: "Globale SEO-standarder",
  type: "object",
  fields: fields(true),
});
export const seo = defineType({
  name: "seo",
  title: "SEO og deling",
  type: "object",
  fields: [
    ...fields(false),
    defineField({
      name: "canonical",
      title: "Canonical override",
      type: "url",
      description: "Avansert. La stå tomt når sidens egen adresse er fasit.",
      validation: (r) =>
        r.custom((value) => canonicalOverride(value).error ?? true),
    }),
    defineField({
      name: "ogTitle",
      title: "Egen delingstittel",
      type: "string",
      description: "Valgfri. Brukes i stedet for metatittelen ved deling.",
    }),
    defineField({
      name: "ogDescription",
      title: "Egen delingsbeskrivelse",
      type: "text",
      rows: 2,
    }),
  ],
});
