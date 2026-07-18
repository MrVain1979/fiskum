import { ImageIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const projectReference = defineType({
  name: "projectReference",
  title: "Referanse",
  type: "document",
  icon: ImageIcon,
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
      name: "category",
      title: "Kategori",
      type: "string",
      options: {
        list: [
          { title: "Stålbygg", value: "stalbygg" },
          { title: "Vegger, fasade og tak", value: "vegger-fasade-og-tak" },
          { title: "Broer", value: "broer" },
          { title: "Trapper, rekkverk og ramper", value: "trapper-rekkverk-og-ramper" },
          { title: "Kran og transport", value: "kran-og-transport" },
        ],
      },
    }),
    defineField({
      name: "summary",
      title: "Kort tekst",
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
      description: "PDF-er som skal vises på referansesiden.",
      type: "array",
      of: [{ type: "pdfFile" }],
    }),
  ],
  preview: {
    select: {
      title: "internalTitle",
      subtitle: "category",
      media: "gallery.0",
    },
  },
});
