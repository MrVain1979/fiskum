import { defineField, defineType } from "sanity";

export const imageWithAlt = defineType({
  name: "imageWithAlt",
  title: "Bilde",
  type: "image",
  options: {
    hotspot: true,
  },
  fields: [
    defineField({
      name: "alt",
      title: "Alternativ tekst",
      type: "string",
      description:
        "Beskriv bildets innhold og funksjon. Dekorative bilder markeres separat.",
    }),
    defineField({
      name: "decorative",
      title: "Kun dekorativt bilde",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "caption",
      title: "Bildetekst",
      type: "string",
    }),
  ],
  validation: (rule) =>
    rule.custom((value, context) => {
      // Archived legacy fields are preserved for rollback; only the active model is editable.
      if (context.path?.[0] === "image") return true;
      if (
        context.path?.some(
          (part) =>
            typeof part === "string" &&
            ["gallery", "heroImages", "pageBuilder", "seoImage"].includes(part),
        )
      )
        return true;
      const image = value as
        | { asset?: { _ref?: string }; alt?: string; decorative?: boolean }
        | undefined;
      return (
        !image?.asset?._ref ||
        image.decorative ||
        Boolean(image.alt?.trim()) ||
        "Skriv alternativ tekst eller marker bildet som dekorativt."
      );
    }),
});
