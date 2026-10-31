import { defineField, defineType } from "sanity";
const types = ["homePage", "page", "service", "projectReference", "newsPost"];
export const linkTarget = defineType({
  name: "linkTarget",
  title: "Lenkemål",
  type: "object",
  fields: [
    defineField({
      name: "kind",
      title: "Lenketype",
      type: "string",
      options: {
        list: [
          { title: "Intern side", value: "internal" },
          { title: "Ekstern nettside", value: "external" },
          { title: "E-post", value: "email" },
          { title: "Telefon", value: "phone" },
          { title: "Anker på denne siden", value: "anchor" },
          { title: "Fil/PDF", value: "file" },
        ],
      },
    }),
    defineField({
      name: "document",
      title: "Velg side",
      type: "reference",
      to: types.map((type) => ({ type })),
      hidden: ({ parent }) => parent?.kind !== "internal",
    }),
    defineField({
      name: "url",
      title: "Ekstern adresse",
      type: "url",
      hidden: ({ parent }) => parent?.kind !== "external",
      validation: (r) => r.uri({ scheme: ["https", "http"] }),
    }),
    defineField({
      name: "email",
      title: "E-post",
      type: "string",
      validation: (r) => r.email(),
      hidden: ({ parent }) => parent?.kind !== "email",
    }),
    defineField({
      name: "phone",
      title: "Telefon",
      type: "string",
      hidden: ({ parent }) => parent?.kind !== "phone",
    }),
    defineField({
      name: "anchor",
      title: "Anker-ID uten #",
      type: "string",
      hidden: ({ parent }) => parent?.kind !== "anchor",
      validation: (r) =>
        r.regex(/^[A-Za-z][A-Za-z0-9_-]*$/, { name: "gyldig anker-ID" }),
    }),
    defineField({
      name: "file",
      title: "Fil",
      type: "file",
      hidden: ({ parent }) => parent?.kind !== "file",
    }),
  ],
  validation: (r) =>
    r.custom((value) => {
      if (
        !value ||
        !Object.entries(value).some(
          ([k, v]) => !["_type", "_key"].includes(k) && Boolean(v),
        )
      )
        return true;
      const obj = value as {
        kind?: string;
        document?: { _ref?: string };
        url?: string;
        email?: string;
        phone?: string;
        anchor?: string;
        file?: { asset?: { _ref?: string } };
      };
      const valid =
        obj.kind === "internal"
          ? obj.document?._ref
          : obj.kind === "external"
            ? obj.url
            : obj.kind === "email"
              ? obj.email
              : obj.kind === "phone"
                ? /^\+?[0-9]{5,15}$/.test(
                    (obj.phone ?? "").replace(/[\s()-]/g, ""),
                  )
                : obj.kind === "anchor"
                  ? obj.anchor
                  : obj.kind === "file"
                    ? obj.file?.asset?._ref
                    : false;
      return Boolean(valid) || "Velg lenketype og et gyldig mål.";
    }),
});
export const customUrl = defineType({
  name: "customUrl",
  title: "Lenke",
  type: "object",
  fields: [
    defineField({ name: "target", title: "Lenkemål", type: "linkTarget" }),
    defineField({
      name: "openInNewTab",
      hidden: ({ document }) => document?._type === "redirect",
      title: "Åpne i ny fane",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "type",
      title: "Tidligere lenketype",
      type: "string",
      hidden: true,
      readOnly: true,
    }),
    defineField({
      name: "external",
      title: "Tidligere adresse",
      type: "string",
      hidden: true,
      readOnly: true,
    }),
    defineField({ name: "href", type: "string", hidden: true, readOnly: true }),
    defineField({
      name: "internal",
      type: "reference",
      to: [...types, "blog", "blogIndex"].map((type) => ({ type })),
      hidden: true,
      readOnly: true,
    }),
  ],
  validation: (r) =>
    r.custom((value) => {
      if (
        !value ||
        !Object.entries(value).some(
          ([k, v]) =>
            !["_type", "_key", "openInNewTab"].includes(k) && Boolean(v),
        )
      )
        return true;
      return (
        Boolean((value as { target?: { kind?: string } }).target?.kind) ||
        "Velg et lenkemål."
      );
    }),
  preview: {
    select: { title: "target.kind" },
    prepare: ({ title }) => ({ title: title || "Velg lenkemål" }),
  },
});
