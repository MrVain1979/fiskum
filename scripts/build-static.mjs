// Compatibility CLI for the original Fiskum exporter. Public routes use the same pure renderer.
import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  fetchContent,
  allDocuments,
  validateContent,
  cmsErrorHtml,
  pageHtml,
  routeFor,
  normalizePath,
  resolveLink,
  redirectHtml,
} from "../lib/render-content.mjs";
export * from "../lib/render-content.mjs";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distMirrors = ["dist", "apps/studio/dist"];
const mirrors = ["", "apps/studio", ...distMirrors];
const generatedRoots = [
  "2026",
  "aktuelt",
  "broer",
  "category",
  "kontakt-oss",
  "kranutleie",
  "om-oss",
  "referanser",
  "stalbygg",
  "tjenester",
  "trapper",
  "vegger",
  "verksted",
];

function fileForRoute(route, mirror) {
  const base = mirror ? join(root, mirror) : root;
  if (route === "/") return join(base, "index.html");
  return join(base, route.replace(/^\/+|\/+$/g, ""), "index.html");
}

async function writeRoute(route, html) {
  for (const mirror of mirrors) {
    const file = fileForRoute(route, mirror);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, html, "utf8");
  }
}

async function cleanGeneratedRoutes() {
  for (const mirror of distMirrors) {
    await rm(join(root, mirror), { recursive: true, force: true });
  }
  for (const mirror of mirrors) {
    if (distMirrors.includes(mirror)) continue;
    const base = mirror ? join(root, mirror) : root;
    for (const routeRoot of generatedRoots) {
      await rm(join(base, routeRoot), { recursive: true, force: true });
    }
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function prepareDist() {
  const entries = [
    "styles.css",
    "script.js",
    "favicon.ico",
    "assets",
    "studio",
    "static",
  ];
  for (const mirror of distMirrors) {
    const outputRoot = join(root, mirror);
    await mkdir(outputRoot, { recursive: true });
    for (const entry of entries) {
      const source = join(root, entry);
      if (await exists(source))
        await cp(source, join(outputRoot, entry), {
          recursive: true,
          force: true,
        });
    }
  }
}

async function prepareStudioStaticRoutes() {
  const studioRoutes = ["structure"];

  for (const mirror of mirrors) {
    const base = mirror ? join(root, mirror) : root;
    const studioIndex = join(base, "studio", "index.html");
    if (!(await exists(studioIndex))) continue;

    for (const route of studioRoutes) {
      const targetDir = join(base, "studio", route);
      await mkdir(targetDir, { recursive: true });
      await cp(studioIndex, join(targetDir, "index.html"), { force: true });
    }
  }
}

async function build() {
  const data = await fetchContent();
  const documents = allDocuments(data);

  const issues = validateContent(data, documents);
  await cleanGeneratedRoutes();
  await prepareDist();
  await prepareStudioStaticRoutes();

  if (issues.length) {
    const html = cmsErrorHtml(issues);
    await writeRoute("/", html);
    console.warn(
      `Sanity-innholdet er ikke komplett. Skrev tydelig CMS-feilside uten fallback:\n- ${issues.join("\n- ")}`,
    );
    return;
  }

  const routes = new Set();

  for (const document of documents) {
    const route = routeFor(document);
    if (!route || routes.has(route)) continue;
    routes.add(route);
    await writeRoute(route, pageHtml({ ...data, document }, route));
  }

  const aktuelt = documents.find((doc) => routeFor(doc) === "/aktuelt/");
  if (aktuelt)
    await writeRoute(
      "/category/aktuelt/",
      pageHtml({ ...data, document: aktuelt }, "/category/aktuelt/"),
    );

  for (const redirectRule of data.redirects || []) {
    const source = normalizePath(redirectRule.from);
    const destination = resolveLink(redirectRule.to);
    if (!source || !destination || source === destination || routes.has(source))
      continue;
    await writeRoute(source, redirectHtml(destination));
  }

  console.log(`Generated ${routes.size} Sanity-backed routes.`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await build();
}
