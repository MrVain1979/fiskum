import { Mail } from "lucide-react";
import { defineField, defineType } from "sanity";

import { customRichText } from "../definitions/rich-text";

export const subscribeNewsletter = defineType({
  name: "subscribeNewsletter",
  title: "Forespørsel om nyhetsbrev",
  type: "object",
  icon: Mail,
  description:
    "Bruker nettstedets eksisterende sikre innboks. Registrerer bare en uttrykkelig forespørsel hos bedriften; melder ingen automatisk på en ekstern e-postliste.",
  fields: [
    defineField({
      name: "title",
      title: "Tittel",
      type: "string",
    }),
    customRichText(["block"], {
      name: "subTitle",
      title: "Innledning",
    }),
    customRichText(["block"], {
      name: "helperText",
      title: "Hjelpetekst",
    }),
  ],
  preview: {
    select: {
      title: "title",
    },
    prepare: ({ title }) => ({
      title: title ?? "Untitled",
      subtitle: "Subscribe Newsletter",
    }),
  },
});
