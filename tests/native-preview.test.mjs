import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
globalThis.previewFixture = {
  enabled: false,
  perspective: "drafts",
  calls: [],
};
const resolver = new URL(
  "../node_modules/next-sanity/dist/resolveVariantFromCookies.js",
  import.meta.url,
).href;
registerHooks({
  resolve(specifier, context, next) {
    let source;
    if (specifier === "server-only") source = "";
    if (specifier === "next/headers")
      source = `export const draftMode=async()=>({isEnabled:globalThis.previewFixture.enabled});export const cookies=async()=>{globalThis.previewFixture.cookieReads=(globalThis.previewFixture.cookieReads||0)+1;return {has:name=>name==='sanity-preview-perspective',get:()=>({value:globalThis.previewFixture.perspective})}};`;
    if (specifier === "next-sanity/live")
      source = `export {n as resolvePerspectiveFromCookies,t as resolveVariantFromCookies} from ${JSON.stringify(resolver)};export const defineLive=options=>{globalThis.liveOptions=options;return {sanityFetch:async options=>{globalThis.previewFixture.calls.push(options);return {data:{title:options.perspective==='published'?'Published':'Draft'}}},SanityLive:()=>null}};`;
    return source === undefined
      ? next(specifier, context)
      : {
          url: "data:text/javascript," + encodeURIComponent(source),
          shortCircuit: true,
        };
  },
});
process.env.SANITY_API_READ_TOKEN = "server-only-reader";
process.env.SANITY_PROJECT_ID = "qgyys6fw";
process.env.SANITY_DATASET = "production";
process.env.SANITY_API_VERSION = "2025-06-01";
const { requestLiveQuery } = await import("../lib/sanity-live.ts");
const { sanityQuery } = await import("../lib/sanity-content.mts");
const { previewRouteKey } = await import("../lib/preview-route-key.ts");
test("private Inbox reader never enters browser live configuration", () => {
  assert.equal(globalThis.liveOptions.browserToken, false);
  assert.equal(globalThis.liveOptions.serverToken, "server-only-reader");
});
test("forged perspective cookie cannot authorize a draft fetch", async () => {
  globalThis.previewFixture.enabled = false;
  await assert.rejects(requestLiveQuery("fixture"), /autorisert Draft Mode/);
  const value = await sanityQuery("fixture", {}, [], async (url) => {
    assert.equal(new URL(url).searchParams.get("perspective"), "published");
    return Response.json({ result: { title: "Published" } });
  });
  assert.equal(value.title, "Published");
  assert.equal(globalThis.previewFixture.calls.length, 0);
});
test("authorized draft data follows installed SDK Drafts → Published → Drafts perspective resolver", async () => {
  globalThis.previewFixture.enabled = true;
  for (const perspective of ["drafts", "published", "drafts"]) {
    globalThis.previewFixture.perspective = perspective;
    assert.equal(
      (await requestLiveQuery("fixture", {}, false)).title,
      perspective === "published" ? "Published" : "Draft",
    );
    const call = globalThis.previewFixture.calls.at(-1);
    assert.equal(call.perspective, perspective);
    assert.equal(call.stega, false);
  }
});

test("public route keys read no cookies; authorized perspective keys reset the child boundary scope", async () => {
  globalThis.previewFixture.cookieReads = 0;
  assert.equal(await previewRouteKey(false), "published");
  assert.equal(globalThis.previewFixture.cookieReads, 0);
  const keys = [];
  for (const perspective of ["drafts", "published", "drafts"]) {
    globalThis.previewFixture.perspective = perspective;
    keys.push(await previewRouteKey(true));
  }
  assert.notEqual(keys[0], keys[1]);
  assert.equal(keys[0], keys[2]);
  assert.equal(globalThis.previewFixture.cookieReads, 3);
});
