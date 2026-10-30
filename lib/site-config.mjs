export const productionOrigin = "https://www.fiskum-sveis.no";

export function isPreviewDeployment() {
  return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development";
}
