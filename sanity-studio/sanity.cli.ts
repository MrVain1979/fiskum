import { defineCliConfig } from "sanity/cli";

const projectId = process.env.SANITY_STUDIO_PROJECT_ID ?? "qgyys6fw";
const dataset = process.env.SANITY_STUDIO_DATASET ?? "production";
const host = process.env.HOST_NAME;
const productionHostName = process.env.SANITY_STUDIO_PRODUCTION_HOSTNAME;

export default defineCliConfig({
  api: {
    projectId,
    dataset,
  },
  studioHost:
    host && host !== "main"
      ? `${host}-${productionHostName}`
      : productionHostName,
  autoUpdates: false,
});
