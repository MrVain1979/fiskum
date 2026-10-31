// Offline review only. Business snapshots/baselines contain customer drafts and must stay outside Git.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { JSDOM } from "../sanity-studio/node_modules/jsdom/lib/api.js";
import { parse, evaluate } from "groq-js";
import { buildMigration } from "./full-313-model.mjs";
import {
  allDocuments,
  contentQuery,
  documentBody,
  pageMetadata,
  routeFor,
} from "./build-static.mjs";
const args = process.argv.slice(2),
  arg = (name) => args[args.indexOf(name) + 1];
for (const required of ["--source", "--baseline", "--output"])
  if (!args.includes(required)) throw new Error(`Provide ${required}`);
const snapshot = JSON.parse(await readFile(arg("--source"), "utf8"));
const baseline = JSON.parse(await readFile(arg("--baseline"), "utf8"));
const plan = buildMigration(snapshot),
  patches = new Map(plan.documents.map((value) => [value.id, value.after]));
function unchanged(before, after, path = "") {
  if (before && typeof before === "object") {
    for (const [key, value] of Object.entries(before))
      unchanged(value, after?.[key], `${path}.${key}`);
  } else assert.deepEqual(after, before, `Original leaf changed: ${path}`);
}
for (const document of plan.documents)
  unchanged(document.before, document.after, document.id);
function visible(html) {
  const document = new JSDOM(html).window.document;
  const texts = [];
  const walk = (node) => {
    if (node.nodeType === 3) {
      const text = node.textContent.replace(/\s+/g, " ").trim();
      if (text) texts.push(text);
    } else for (const child of node.childNodes) walk(child);
  };
  walk(document.body);
  return {
    icons: [...document.querySelectorAll("svg")].map((node) => node.outerHTML),
    texts,
    links: [...document.querySelectorAll("a")].map((node) =>
      node.getAttribute("href"),
    ),
    images: [...document.querySelectorAll("img")].map(
      (node) =>
        new URL(node.getAttribute("src") || node.getAttribute("data-src"))
          .pathname,
    ),
  };
}
const result = {
  sourceQueriedAt: snapshot.queriedAt,
  patches: plan.mutations.length,
  independentDrafts: plan.documents.filter((d) => d.id.startsWith("drafts."))
    .length,
  originalLeavesPreserved: true,
  perspectives: {},
};
for (const perspective of ["published", "drafts"]) {
  const source = snapshot.documents.map(
    (document) => patches.get(document._id) || document,
  );
  const map = new Map(
    source
      .filter((document) => !document._id.startsWith("drafts."))
      .map((document) => [document._id, document]),
  );
  if (perspective === "drafts")
    for (const document of source.filter((document) =>
      document._id.startsWith("drafts."),
    ))
      map.set(document._id.slice(7), {
        ...document,
        _id: document._id.slice(7),
      });
  const data = await (
    await evaluate(parse(contentQuery()), {
      dataset: [...map.values(), ...snapshot.assets],
    })
  ).get();
  let checked = 0;
  for (const document of allDocuments(data)) {
    const old = baseline[perspective].find(
      (value) => value.id === document._id,
    );
    assert.ok(old, "Existing route lacks baseline");
    const path = routeFor(document),
      context = { ...data, document };
    assert.equal(path, old.path);
    assert.deepEqual(
      visible(documentBody(context, path)),
      visible(old.html),
      `${perspective} ${path}: visible design content changed`,
    );
    const image = pageMetadata(context, path).openGraph.images[0];
    const previous = old.metadata.openGraph.images[0];
    assert.equal(
      new URL(image.url).pathname,
      new URL(previous.url).pathname,
      `${perspective} ${path}: sharing artwork changed`,
    );
    assert.equal(
      new URL(image.url).searchParams.get("rect"),
      new URL(previous.url).searchParams.get("rect"),
      `${perspective} ${path}: sharing artwork crop changed`,
    );
    checked++;
  }
  result.perspectives[perspective] = {
    routes: checked,
    visibleTextLinksAndImagesPreserved: true,
    sharingArtworkPreserved: true,
  };
}
await writeFile(arg("--output"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result));
