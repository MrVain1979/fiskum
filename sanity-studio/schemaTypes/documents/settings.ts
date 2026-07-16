import { CogIcon } from "lucide-react";
import { defineField, defineType } from "sanity";

const socialLinks = defineField({
  name: "socialLinks",
  title: "Sosiale medier",
  description: "Lenker til bedriftens profiler",
  type: "object",
  options: {},
  fields: [
    defineField({
      name: "linkedin",
      title: "LinkedIn",
      type: "string",
    }),
    defineField({
      name: "facebook",
      title: "Facebook",
      type: "string",
    }),
    defineField({
      name: "twitter",
      title: "X / Twitter",
      type: "string",
    }),
    defineField({
      name: "instagram",
      title: "Instagram",
      type: "string",
    }),
    defineField({
      name: "youtube",
      title: "YouTube",
      type: "string",
    }),
  ],
});

export const settings = defineType({
  name: "settings",
  type: "document",
  title: "Sideinnstillinger",
  description: "Global informasjon som brukes flere steder på nettsiden",
  icon: CogIcon,
  fields: [
    defineField({
      name: "label",
      type: "string",
      initialValue: "Sideinnstillinger",
      title: "Navn i Sanity",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "companyName",
      type: "string",
      title: "Firmanavn",
      initialValue: "Fiskum Plate & Sveiseverksted AS",
    }),
    defineField({
      name: "siteTitle",
      type: "string",
      title: "Standard sidetittel",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "siteDescription",
      type: "text",
      title: "Standard SEO-beskrivelse",
      validation: (rule) => rule.required().min(50).max(160),
    }),
    defineField({
      name: "logo",
      type: "image",
      title: "Logo",
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: "phone",
      type: "string",
      title: "Telefon",
      initialValue: "32 75 06 77",
    }),
    defineField({
      name: "contactEmail",
      type: "string",
      title: "E-post",
      initialValue: "post@fiskum-sveis.no",
      validation: (rule) => rule.email(),
    }),
    defineField({
      name: "address",
      type: "object",
      title: "Adresse",
      fields: [
        defineField({ name: "street", title: "Gateadresse", type: "string", initialValue: "Kongsbergveien 791" }),
        defineField({ name: "postalCode", title: "Postnummer", type: "string", initialValue: "3322" }),
        defineField({ name: "city", title: "Poststed", type: "string", initialValue: "Fiskum" }),
        defineField({ name: "country", title: "Land", type: "string", initialValue: "Norge" }),
      ],
    }),
    socialLinks,
  ],
  preview: {
    select: {
      title: "label",
    },
    prepare: ({ title }) => ({
      title: title || "Untitled Settings",
      media: CogIcon,
    }),
  },
});
