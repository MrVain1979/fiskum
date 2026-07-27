import { LinkIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const redirect = defineType({
  name: "redirect",
  title: "URL-videresending",
  type: "document",
  icon: LinkIcon,
  fields: [
    defineField({
      name: "title",
      title: "Intern tittel",
      type: "string",
      description: "Kun for oversikt i Sanity.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "from",
      title: "Gammel URL",
      type: "string",
      description: "For eksempel /gammel-side/. Skal starte med /.",
      validation: (rule) =>
        rule
          .required()
          .custom((value) => {
            if (!value) return true;
            if (!value.startsWith("/")) return "URL må starte med /";
            if (value.startsWith("/studio") || value.startsWith("/api")) {
              return "Kan ikke videresende Studio- eller API-ruter.";
            }
            return true;
          }),
    }),
    defineField({
      name: "to",
      title: "Ny URL",
      type: "customUrl",
      description: "Velg intern side eller skriv ekstern URL.",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "permanent",
      title: "Permanent videresending",
      type: "boolean",
      initialValue: true,
      description: "Bruk permanent for vanlige URL-endringer.",
    }),
  ],
  preview: {
    select: {
      title: "title",
      from: "from",
    },
    prepare: ({ title, from }) => ({
      title,
      subtitle: from,
    }),
  },
});
