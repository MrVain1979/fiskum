import { DocumentTextIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const newsPost = defineType({
  name: "newsPost",
  title: "Aktuelt",
  type: "document",
  icon: DocumentTextIcon,
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
      name: "publishedAt",
      title: "Publiseringsdato",
      type: "datetime",
    }),
    defineField({
      name: "excerpt",
      title: "Ingress",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "mainImage",
      title: "Hovedbilde",
      type: "imageWithAlt",
    }),
    defineField({
      name: "body",
      title: "Innhold",
      type: "richText",
    }),
  ],
  preview: {
    select: {
      title: "internalTitle",
      subtitle: "publishedAt",
      media: "mainImage",
    },
  },
});
