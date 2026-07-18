import { CogIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const service = defineType({
  name: "service",
  title: "Tjeneste",
  type: "document",
  icon: CogIcon,
  fields: [
    defineField({
      name: "internalTitle",
      title: "Navn i Sanity",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "title",
      title: "Synlig tittel",
      type: "string",
    }),
    defineField({
      name: "slug",
      title: "URL",
      type: "slug",
      options: { source: "internalTitle" },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "summary",
      title: "Ingress",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "body",
      title: "Innhold",
      type: "richText",
    }),
    defineField({
      name: "gallery",
      title: "Galleri",
      type: "array",
      of: [{ type: "imageWithAlt" }],
    }),
    defineField({
      name: "pdfFiles",
      title: "PDF-dokumenter",
      description: "PDF-er som skal vises på tjenestesiden.",
      type: "array",
      of: [{ type: "pdfFile" }],
    }),
    defineField({
      name: "seo",
      title: "SEO",
      type: "object",
      fields: [
        defineField({ name: "title", title: "SEO-tittel", type: "string" }),
        defineField({ name: "description", title: "SEO-beskrivelse", type: "text", rows: 3 }),
      ],
    }),
  ],
  preview: {
    select: {
      title: "internalTitle",
      subtitle: "slug.current",
      media: "gallery.0",
    },
  },
});
