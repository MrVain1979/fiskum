import { assist } from "@sanity/assist";
import { visionTool } from "@sanity/vision";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import {
  unsplashAssetSource,
  unsplashImageAsset,
} from "sanity-plugin-asset-source-unsplash";
import { iconPicker } from "sanity-plugin-icon-picker";
import { media, mediaAssetSource } from "sanity-plugin-media";

import { LivePreviewLayout } from "./components/live-preview-layout";
import { importContentTool } from "./import/importContentTool";
import { Logo } from "./components/logo";
import { schemaTypes } from "./schemaTypes";
import { structure } from "./structure";
import { createPageTemplate } from "./utils/helper";

function requiredEnv(name: string) {
  const importMetaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
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

export default defineConfig({
  name: "default",
  title,
  projectId: projectId,
  icon: Logo,
  dataset,
  basePath: "/studio",
  mediaLibrary: {
    enabled: true,
  },
  plugins: [
    assist(),
    structureTool({
      structure,
    }),
    visionTool(),
    iconPicker(),
    media(),
    unsplashImageAsset(),
  ],

  form: {
    image: {
      assetSources: (sources) =>
        sources.filter((source) => source.name !== "sanity-default"),
    },
  },
  document: {
    components: {
      unstable_layout: LivePreviewLayout,
    },
    newDocumentOptions: (prev, { creationContext }) => {
      const { type } = creationContext;
      if (type === "global") return [];
      return prev;
    },
  },
  schema: {
    types: schemaTypes,
    templates: createPageTemplate(),
  },
  tools: (prev) => [...prev, importContentTool],
});
