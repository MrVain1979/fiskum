import { defineField, type DocumentDefinition } from "sanity";
import { GROUP, GROUPS } from "../utils/constant";
import { createSlug } from "../utils/slug";
import { validateParent, validateRouteSlug } from "./content-validation";
const routeTypes = [
  "homePage",
  "page",
  "service",
  "projectReference",
  "newsPost",
];
const archived = [
  "image",
  "description",
  "pageBuilder",
  "body",
  "richText",
  "gallery",
  "pdfFiles",
  "heroImages",
  "heroLead",
  "galleryEyebrow",
  "galleryTitle",
  "sideQuote",
  "contactDetails",
  "contactPeople",
  "seoTitle",
  "seoDescription",
  "seoImage",
  "seoHideFromLists",
  "ogTitle",
  "ogDescription",
];
export function modernizeDocument(
  document: DocumentDefinition,
): DocumentDefinition {
  if (!routeTypes.includes(document.name)) return document;
  return {
    ...document,
    groups: GROUPS,
    fields: [
      ...document.fields
        .filter((f) => f.name !== "seo")
        .map((field) => {
          if (field.name === "slug")
            return defineField({
              name: "slug",
              title: field.title || "URL",
              type: "slug",
              options: {
                source: document.name === "page" ? "title" : "internalTitle",
                slugify: createSlug,
              },
              readOnly: document.name === "homePage",
              validation: (r) => r.required().custom(validateRouteSlug),
              description:
                "Etablert URL-format beholdes. Tittelendring overskriver ikke slug. En ny slug kan vises som utkast i Live Preview.",
              group: GROUP.MAIN_CONTENT,
            });
          return {
            ...field,
            ...(field.name === "image" && field.type === "image"
              ? { type: "imageWithAlt" }
              : {}),
            group: field.group ?? GROUP.MAIN_CONTENT,
            ...(archived.includes(field.name)
              ? { hidden: true, readOnly: true, validation: undefined }
              : {}),
            ...(document.name === "page" &&
            [
              "galleryEyebrow",
              "galleryTitle",
              "sideQuote",
              "contactDetails",
              "contactPeople",
            ].includes(field.name)
              ? { hidden: true, readOnly: true, validation: undefined }
              : {}),
          };
        }),
      ...(!document.fields.some((f) => f.name === "body")
        ? [
            defineField({
              name: "body",
              title: "Tidligere brødtekst",
              type: "richText",
              hidden: true,
              readOnly: true,
            }),
          ]
        : []),
      ...(!document.fields.some((f) => f.name === "seoNoIndex")
        ? [
            defineField({
              name: "seoNoIndex",
              title: "Skjul fra søkemotorer",
              type: "boolean",
              initialValue: false,
              group: GROUP.SEO,
            }),
          ]
        : []),
      ...(["projectReference", "newsPost"].includes(document.name)
        ? [
            defineField({
              name: "listingPage",
              title: "Tilhørende samleside",
              type: "reference",
              to: [{ type: "page" }],
              group: GROUP.MAIN_CONTENT,
            }),
          ]
        : []),
      defineField({
        name: "intro",
        title: "Synlig ingress",
        type: "text",
        rows: 3,
        group: GROUP.MAIN_CONTENT,
      }),
      defineField({
        name: "navigationTitle",
        title: "Kort navigasjonstittel",
        type: "string",
        group: GROUP.MAIN_CONTENT,
      }),
      ...(document.name === "page"
        ? [
            defineField({
              name: "parent",
              title: "Overordnet side",
              type: "reference",
              to: [{ type: "page" }],
              group: GROUP.MAIN_CONTENT,
              description:
                "Maksimalt tre nivåer. URL-en endres ikke ved flytting. Publiser forelderen først; sterke referanser beskytter mot fjerning.",
              validation: (r) => r.custom(validateParent),
              options: {
                filter: ({ document }) => ({
                  filter: '!(_id in [$id,"drafts."+$id])',
                  params: { id: document._id.replace(/^drafts\./, "") },
                }),
              },
            }),
          ]
        : []),
      defineField({
        name: "sections",
        title: "Seksjoner",
        type: "pageBuilder",
        group: GROUP.MAIN_CONTENT,
        validation: (r) =>
          r.custom((value) => {
            const anchors = (Array.isArray(value) ? value : [])
              .filter(
                (s: { hidden?: boolean }) =>
                  !(s as { hidden?: boolean }).hidden,
              )
              .map(
                (s: { anchor?: string }) => (s as { anchor?: string }).anchor,
              )
              .filter(Boolean);
            return (
              new Set(anchors).size === anchors.length ||
              "Synlige seksjoner må ha unike anker-ID-er."
            );
          }),
      }),
      defineField({
        name: "seo",
        title: "SEO og deling",
        type: "seo",
        group: GROUP.SEO,
      }),
      defineField({
        name: "previousPaths",
        title: "Tidligere URL-er",
        type: "array",
        of: [{ type: "string" }],
        readOnly: true,
        group: GROUP.SEO,
        description:
          "Native Publish lagrer automatisk tidligere publisert adresse, også når dato endres på en nyhet.",
      }),
      defineField({
        name: "sidebarVariant",
        title: "Utforming av sideboks",
        type: "string",
        options: {
          list: [
            { title: "Global kontakt", value: "contact" },
            { title: "Felles tjenester", value: "services" },
            { title: "Ingen sideboks", value: "none" },
          ],
        },
        initialValue: "contact",
        group: GROUP.MAIN_CONTENT,
      }),
    ],
  };
}
