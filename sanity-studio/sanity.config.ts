import { assist } from "@sanity/assist";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import {
  unsplashAssetSource,
  unsplashImageAsset,
} from "sanity-plugin-asset-source-unsplash";
import { media } from "sanity-plugin-media";

import { presentationTool, defineLocations } from "sanity/presentation";
import { contentPath } from "../lib/content-path.ts";
import { withSlugHistory } from "./components/slug-history-action";
import { Logo } from "./components/logo";
import { schemaTypes } from "./schemaTypes";
import { structure } from "./structure";

function requiredEnv(name: string) {
  const importMetaEnv = (
    import.meta as unknown as { env?: Record<string, string | undefined> }
  ).env;
  const processEnv = typeof process !== "undefined" ? process.env : {};
  const value = processEnv[name] || importMetaEnv?.[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const projectId = requiredEnv("SANITY_STUDIO_PROJECT_ID");
const dataset = requiredEnv("SANITY_STUDIO_DATASET");
const title = requiredEnv("SANITY_STUDIO_TITLE");
const archivedTypes = new Set(["blog", "blogIndex", "author"]);
const singletonTypes = new Set([
  "homePage",
  "settings",
  "navbar",
  "footer",
  "blogIndex",
]);
const routeTypes = new Set(["page", "service", "projectReference", "newsPost"]);
const wrapped = new WeakMap<object, ReturnType<typeof withSlugHistory>>();
const locations = defineLocations({
  select: {
    title: "title",
    internalTitle: "internalTitle",
    slug: "slug.current",
    publishedAt: "publishedAt",
    type: "_type",
  },
  resolve: (doc) => {
    const href = doc
      ? contentPath({
          _type: doc.type,
          slug: doc.slug,
          publishedAt: doc.publishedAt,
        })
      : null;
    return href
      ? {
          locations: [
            { title: doc?.title || doc?.internalTitle || "Åpne siden", href },
          ],
        }
      : {
          message:
            "Legg inn en gyldig slug og eventuell publiseringsdato først.",
        };
  },
});

export default defineConfig({
  name: "default",
  title,
  projectId: projectId,
  icon: Logo,
  dataset,
  basePath: "/studio",
  plugins: [
    assist(),
    structureTool({
      structure,
    }),
    media(),
    unsplashImageAsset(),
    presentationTool({
      name: "live-preview",
      title: "Live Preview",
      previewUrl: {
        origin:
          typeof window === "undefined"
            ? process.env.SANITY_STUDIO_PRESENTATION_URL ||
              "https://www.fiskum-sveis.no"
            : window.location.origin,
        previewMode: { enable: "/api/draft-mode/enable", shareAccess: false },
      },
      resolve: {
        locations: {
          homePage: defineLocations({
            locations: [{ title: "Forside", href: "/" }],
          }),
          page: locations,
          service: locations,
          projectReference: locations,
          newsPost: locations,
          settings: defineLocations({
            message: "Globale innstillinger brukes på alle sider.",
            locations: [{ title: "Forside", href: "/" }],
          }),
          navbar: defineLocations({
            locations: [{ title: "Hovedmeny på forsiden", href: "/" }],
          }),
          footer: defineLocations({
            locations: [{ title: "Footer på forsiden", href: "/" }],
          }),
          faq: defineLocations({
            message: "FAQ kan deles av flere sider.",
            locations: [{ title: "Forside", href: "/" }],
          }),
        },
        mainDocuments: [
          { route: "/", filter: '_type=="homePage"' },
          {
            route: "/referanser/:slug",
            filter:
              '_type=="projectReference" && slug.current in [$slug,"/"+$slug]',
          },
          {
            route: "/:year/:month/:day/:slug",
            filter: '_type=="newsPost" && slug.current in [$slug,"/"+$slug]',
          },
          {
            route: "/:slug",
            filter:
              '_type in ["page","service"] && slug.current in [$slug,"/"+$slug,"/"+$slug+"/"]',
          },
        ],
      },
    }),
  ],

  document: {
    newDocumentOptions: (prev, { creationContext }) => {
      return prev.filter(
        (option) =>
          option.templateId !== "formSubmission" &&
          !singletonTypes.has(option.templateId) &&
          !archivedTypes.has(option.templateId),
      );
    },
    actions: (actions, context) => {
      if (archivedTypes.has(context.schemaType)) return [];
      if (context.schemaType === "formSubmission")
        return actions.filter((action) => action.action === "delete");
      if (singletonTypes.has(context.schemaType))
        return actions.filter(
          (action) =>
            !["delete", "duplicate", "unpublish"].includes(action.action || ""),
        );
      if (!routeTypes.has(context.schemaType)) return actions;
      return actions.map((action) => {
        if (action.action !== "publish") return action;
        if (!wrapped.has(action)) wrapped.set(action, withSlugHistory(action));
        return wrapped.get(action)!;
      });
    },
  },
  schema: {
    types: schemaTypes,
    templates: (prev) =>
      prev.filter(
        (template) =>
          template.schemaType !== "formSubmission" &&
          !singletonTypes.has(template.schemaType) &&
          !archivedTypes.has(template.schemaType),
      ),
  },
});
