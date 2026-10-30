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
      validation: (r) => r.uri({ scheme: ["https", "http"] }),
      title: "LinkedIn",
      type: "url",
    }),
    defineField({
      name: "facebook",
      validation: (r) => r.uri({ scheme: ["https", "http"] }),
      title: "Facebook",
      type: "url",
    }),
    defineField({
      name: "twitter",
      validation: (r) => r.uri({ scheme: ["https", "http"] }),
      title: "X / Twitter",
      type: "url",
    }),
    defineField({
      name: "instagram",
      validation: (r) => r.uri({ scheme: ["https", "http"] }),
      title: "Instagram",
      type: "url",
    }),
    defineField({
      name: "youtube",
      validation: (r) => r.uri({ scheme: ["https", "http"] }),
      title: "YouTube",
      type: "url",
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
      name: "siteName",
      title: "Nettstedsnavn",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "defaultSeo",
      title: "Globale SEO-standarder",
      type: "seoDefaults",
      validation: (r) => r.required(),
    }),
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
    }),
    defineField({
      name: "siteTitle",
      type: "string",
      title: "Standard sidetittel",
      hidden: true,
      readOnly: true,
    }),
    defineField({
      name: "siteDescription",
      type: "text",
      title: "Standard SEO-beskrivelse",
      hidden: true,
      readOnly: true,
    }),
    defineField({
      name: "logo",
      type: "imageWithAlt",
      title: "Logo",
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: "phone",
      type: "string",
      title: "Telefon",
    }),
    defineField({
      name: "contactEmail",
      type: "string",
      title: "E-post",
      validation: (rule) => rule.email(),
    }),
    defineField({
      name: "contactFormEnabled",
      type: "boolean",
      title: "Vis kontaktskjema",
      description:
        "Slå på først når mottak av skjema til e-post er godkjent og testet.",
      initialValue: false,
    }),
    defineField({
      name: "address",
      type: "object",
      title: "Adresse",
      fields: [
        defineField({ name: "street", title: "Gateadresse", type: "string" }),
        defineField({
          name: "postalCode",
          title: "Postnummer",
          type: "string",
        }),
        defineField({ name: "city", title: "Poststed", type: "string" }),
        defineField({ name: "country", title: "Land", type: "string" }),
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
