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
      description: "Kort beskrivelse av bildet. La feltet stå tomt hvis bildet kun er dekorativt.",
    }),
    defineField({
      name: "caption",
      title: "Bildetekst",
      type: "string",
    }),
  ],
});
