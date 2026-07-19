import { defineCliConfig } from "sanity/cli";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const projectId = requiredEnv("SANITY_STUDIO_PROJECT_ID");
const dataset = requiredEnv("SANITY_STUDIO_DATASET");
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
