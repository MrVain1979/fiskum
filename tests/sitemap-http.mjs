// Run after `pnpm build`. Real Next HTTP, with an isolated read-only CMS fixture.
// No browser, credential, CMS mutation, webhook replay or cache invalidation.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { routeIndexQuery } from "../lib/sanity-projections.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "fiskum-sitemap-http-"));
const stateFile = join(temporary, "published.json");
const loader = join(temporary, "cms-fixture.cjs");
const reads = join(temporary, "reads.jsonl");
const port = Number(process.env.SITEMAP_TEST_PORT || 3351);
const url = `http://localhost:${port}/sitemap.xml`;
const home = { _id: "home", _type: "homePage" };
const customer = { _id: "existing", _type: "page", slug: "existing" };
const created = { _id: "own-fixture", _type: "page", slug: "new-page" };
const save = (documents) => writeFile(stateFile, JSON.stringify(documents));
await save([home, customer]);
await writeFile(loader, `
const fs = require('node:fs');
const original = globalThis.fetch;
globalThis.fetch = async function(input, init) {
  const value = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  const url = new URL(value);
  if (url.hostname === 'qgyys6fw.api.sanity.io') {
    if (url.searchParams.get('query') !== ${JSON.stringify(routeIndexQuery)} || url.searchParams.get('perspective') !== 'published') {
      throw new Error('Unexpected CMS query in isolated sitemap test');
    }
    fs.appendFileSync(${JSON.stringify(reads)}, JSON.stringify({perspective: url.searchParams.get('perspective')})+String.fromCharCode(10));
    return Response.json({result: JSON.parse(fs.readFileSync(${JSON.stringify(stateFile)}, 'utf8'))});
  }
  return original(input, init);
};
`);
let logs = "";
const child = spawn(process.execPath, ["--require", loader, join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(port)], {
  cwd: root,
  env: { ...process.env, VERCEL_ENV: "production", SANITY_PROJECT_ID: "qgyys6fw", SANITY_DATASET: "production", SANITY_API_VERSION: "2025-06-01" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
child.stdout.on("data", (chunk) => { logs += chunk; });
child.stderr.on("data", (chunk) => { logs += chunk; });
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (logs.includes("Ready in")) break;
    if (child.exitCode !== null) throw Error(`Next start exited (${child.exitCode})`);
    if (attempt === 99) throw Error("Next start timed out");
    await delay(100);
  }
  const receipts = [];
  async function check(phase, expected) {
    const response = await fetch(url);
    const xml = await response.text();
    assert.equal(response.status, 200, phase);
    assert.match(response.headers.get("content-type"), /application\/xml/, phase);
    // Next's metadata loader emits max-age=0/must-revalidate even for dynamic
    // sitemap handlers. Prove freshness through the real same-URL responses.
    assert.doesNotMatch(response.headers.get("cache-control"), /s-maxage|immutable/i, phase);
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
    assert.deepEqual(urls, expected.map((path) => `https://www.fiskum-sveis.no${path}`), phase);
    receipts.push({ phase, status: response.status, cacheControl: response.headers.get("cache-control"), urls });
  }
  await check("cached-negative-baseline", ["/", "/existing/"]);
  await save([home, customer, created]);
  await check("normal-publication", ["/", "/existing/", "/new-page/"]);
  await save([home, customer, { ...created, slug: "renamed-page" }]);
  await check("rename", ["/", "/existing/", "/renamed-page/"]);
  await save([home, customer, { ...created, seoNoIndex: true }]);
  await check("noindex", ["/", "/existing/"]);
  await save([home, customer, { ...created, canonical: "https://example.org/elsewhere/" }]);
  await check("other-canonical", ["/", "/existing/"]);
  await save([home, customer]);
  await check("normal-unpublication", ["/", "/existing/"]);
  const actualReads = (await readFile(reads, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(actualReads.length, receipts.length, "Every XML response reads the published route index");
  console.log(JSON.stringify({ passed: true, phases: receipts, cmsReads: actualReads.length, cmsWrites: 0, manualInvalidations: 0 }));
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  child.kill();
  if (child.exitCode === null) await new Promise((resolve) => child.once("exit", resolve));
  assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
  assert.ok(basename(temporary).startsWith("fiskum-sitemap-http-"));
  await rm(temporary, { recursive: true, force: true });
}
