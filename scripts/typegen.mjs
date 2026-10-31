import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../sanity-studio/", import.meta.url));
const cli = fileURLToPath(
  new URL("../sanity-studio/node_modules/sanity/bin/sanity", import.meta.url),
);
const env = {
  ...process.env,
  SANITY_TELEMETRY_DISABLED: "1",
  CI: "1",
  SANITY_STUDIO_PROJECT_ID: "qgyys6fw",
  SANITY_STUDIO_DATASET: "production",
  SANITY_STUDIO_TITLE: "Fiskum Plate og Sveiseverksted",
};
for (const args of [
  ["schema", "extract", "--path", "schema.json", "--force"],
  ["typegen", "generate"],
]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
