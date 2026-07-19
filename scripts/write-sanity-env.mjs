import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function readEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

const config = {
  projectId: readEnv(["NEXT_PUBLIC_SANITY_PROJECT_ID", "SANITY_STUDIO_PROJECT_ID"]),
  dataset: readEnv(["NEXT_PUBLIC_SANITY_DATASET", "SANITY_STUDIO_DATASET"]),
  apiVersion: readEnv([
    "NEXT_PUBLIC_SANITY_API_VERSION",
    "SANITY_STUDIO_API_VERSION",
    "SANITY_API_VERSION",
  ]),
};

const output = `window.FISKUM_SANITY_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
const targets = [join(root, "sanity-env.js"), join(root, "apps", "studio", "sanity-env.js")];

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, output, "utf8");
}
