import { DocumentIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const pdfFile = defineType({
  name: "pdfFile",
  title: "PDF",
  type: "object",
  icon: DocumentIcon,
  fields: [
    defineField({
      name: "title",
      title: "Tittel",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "description",
      title: "Kort beskrivelse",
      type: "text",
      rows: 2,
    }),
    defineField({
      name: "file",
      title: "PDF-fil",
      type: "file",
      options: {
        accept: "application/pdf",
      },
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "description",
    },
    prepare: ({ title, subtitle }) => ({
      title: title || "PDF uten tittel",
      subtitle,
      media: DocumentIcon,
    }),
  },
});
