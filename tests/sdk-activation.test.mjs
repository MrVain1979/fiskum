import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import { parse, evaluate } from "groq-js";
globalThis.sdkActivation = { enabled: false, cookies: new Map(), writes: [] };
registerHooks({
  resolve(specifier, context, next) {
    let source;
    if (specifier === "next/headers")
      source =
        'export const draftMode=async()=>({isEnabled:globalThis.sdkActivation.enabled,enable:()=>{globalThis.sdkActivation.enabled=true;globalThis.sdkActivation.cookies.set("__prerender_bypass",{value:"test-bypass"})}});export const cookies=async()=>({get:name=>globalThis.sdkActivation.cookies.get(name),set:value=>globalThis.sdkActivation.writes.push(value),delete:value=>globalThis.sdkActivation.writes.push({...value,value:"",deleted:true})});';
    if (specifier === "next/navigation")
      source =
        "export const redirect=location=>new Response(null,{status:307,headers:{Location:location}});";
    return source === undefined
      ? next(specifier, context)
      : {
          url: "data:text/javascript," + encodeURIComponent(source),
          shortCircuit: true,
        };
  },
});
const { defineEnableDraftMode } = await import("next-sanity/draft-mode");
process.env.NODE_ENV = "production";
let records = [],
  queries = 0;
const client = {
  config: () => ({ token: "synthetic-test-reader" }),
  withConfig(options) {
    assert.equal(options.perspective, "raw");
    assert.equal(options.useCdn, false);
    return this;
  },
  async fetch(query, params, options) {
    queries++;
    assert.equal(options.cache, "no-store");
    return (await evaluate(parse(query), { dataset: records, params })).get();
  },
};
const handler = defineEnableDraftMode({ client }).GET;
function reset() {
  globalThis.sdkActivation = { enabled: false, cookies: new Map(), writes: [] };
  queries = 0;
}
const make = (secret = "test-private-secret", headers = {}) =>
  new Request(
    "https://www.fiskum-sveis.no/api/draft-mode/enable?sanity-preview-secret=" +
      secret +
      "&sanity-preview-pathname=%2Fom-oss%2F&sanity-preview-perspective=drafts",
    { headers },
  );
const document = (updatedAt = new Date().toISOString()) => ({
  _id: "sanity-preview-url-secret.test",
  _type: "sanity.previewUrlSecret",
  _updatedAt: updatedAt,
  secret: "test-private-secret",
  studioUrl: "https://www.fiskum-sveis.no/studio",
});
test("real installed SDK refuses wrong, expired and revoked preview secrets before any cookie is enabled", async () => {
  for (const [dataset, secret] of [
    [[document()], "wrong-secret"],
    [
      [document(new Date(Date.now() - 7200000).toISOString())],
      "test-private-secret",
    ],
    [[], "revoked-shared-secret"],
  ]) {
    reset();
    records = dataset;
    assert.equal((await handler(make(secret))).status, 401);
    assert.equal(globalThis.sdkActivation.enabled, false);
    assert.equal(globalThis.sdkActivation.writes.length, 0);
  }
});
test("real installed SDK authorizes a fresh secret and sets CHIPS only for cross-site iframe activation", async () => {
  for (const partitioned of [true, false]) {
    reset();
    records = [document()];
    const response = await handler(
      make("test-private-secret", {
        "sec-fetch-dest": partitioned ? "iframe" : "document",
        "sec-fetch-site": partitioned ? "cross-site" : "same-origin",
      }),
    );
    assert.equal(response.status, 307);
    assert.ok(response.headers.get("location").startsWith("/om-oss/"));
    assert.equal(globalThis.sdkActivation.enabled, true);
    assert.equal(queries, 1);
    const writes = globalThis.sdkActivation.writes;
    const bypass = writes.find((value) => value.name === "__prerender_bypass");
    assert.equal(bypass.partitioned, partitioned);
    assert.equal(bypass.httpOnly, true);
    assert.equal(bypass.secure, true);
    assert.equal(bypass.sameSite, "none");
    assert.equal(
      writes.some(
        (value) =>
          value.name === "sanity-preview-partitioned" && !value.deleted,
      ),
      partitioned,
    );
    assert.ok(
      writes.some(
        (value) =>
          value.name === "sanity-preview-perspective" &&
          value.value === "drafts",
      ),
    );
  }
});
