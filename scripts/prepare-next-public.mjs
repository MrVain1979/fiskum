import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicRoot = join(root, "public");

async function copyIfExists(from, to) {
  try {
    await cp(from, to, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

await mkdir(publicRoot, { recursive: true });
await rm(join(publicRoot, "studio"), { recursive: true, force: true });

await copyIfExists(join(root, "assets"), join(publicRoot, "assets"));
await copyIfExists(join(root, "studio"), join(publicRoot, "studio"));
await copyIfExists(join(root, "script.js"), join(publicRoot, "script.js"));
await copyIfExists(join(root, "favicon.ico"), join(publicRoot, "favicon.ico"));
