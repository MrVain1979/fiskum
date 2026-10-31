// Optional real HTTP acceptance against a built local server. No CMS writes, login or form submission.
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { fetchRouteIndex } from "../lib/sanity-content.mts";
import { documentPath } from "../lib/sanity-cache.mjs";
const origin = process.env.TEST_ORIGIN || "http://localhost:3345";
const get = (path, options = {}) =>
  fetch(new URL(path, origin), { redirect: "manual", ...options });
const paths = (await fetchRouteIndex()).map(documentPath);
let count = 0;
for (const path of paths) {
  const response = await get(path);
  assert.equal(response.status, 200, path);
  const html = await response.text();
  const headings = [...html.matchAll(/<h1[^>]*>(.*?)<\/h1>/gs)];
  assert.equal(headings.length, 1, path);
  assert.ok(headings[0][1].trim(), path);
  assert.match(html, /property="og:image"/, path);
  assert.match(html, /property="og:image:width" content="1200"/, path);
  assert.match(html, /property="og:image:height" content="630"/, path);
  assert.match(html, /application\/ld\+json/, path);
  const pageScript = html.match(
    /<script[^>]*id="fiskum-page-jsonld"[^>]*>([\s\S]*?)<\/script>/,
  );
  assert.ok(pageScript, path);
  const graph = JSON.parse(pageScript[1]);
  assert.ok(["WebPage", "Article"].includes(graph[0]["@type"]), path);
  assert.match(html, /rel="canonical"/, path);
  assert.doesNotMatch(html, /class="preview-status"| data-sanity=/, path);
  count++;
}
const forged = await get("/", {
  headers: {
    cookie: "__prerender_bypass=forged; sanity-preview-perspective=drafts",
  },
});
assert.equal(forged.status, 200);
assert.doesNotMatch(
  await forged.text(),
  /class="preview-status"| data-sanity=/,
);
assert.equal(
  (await get("/api/draft-mode/enable?sanity-preview-secret=invalid")).status,
  process.env.EXPECT_MISSING_READER === "1" ? 503 : 401,
);
for (const path of ["/preview/test/", "/preview/session"])
  assert.equal((await get(path)).status, 410, path);
const forbidden = await get("/api/draft-mode/disable", {
  headers: { referer: "https://evil.test/" },
});
assert.equal(forbidden.status, 403);
assert.equal(forbidden.headers.getSetCookie().length, 0);
const exit = await get("/api/draft-mode/disable", {
  headers: { referer: `${origin}/` },
});
assert.equal(exit.status, 303);
assert.equal(exit.headers.get("location"), `${origin}/`);
const cookies = exit.headers.getSetCookie();
assert.equal(cookies.length, 8);
assert.equal(
  cookies.filter((cookie) => /;\s*Partitioned(?:;|$)/i.test(cookie)).length,
  4,
);
for (const name of [
  "__prerender_bypass",
  "sanity-preview-perspective",
  "sanity-preview-variant",
  "sanity-preview-partitioned",
]) {
  const pair = cookies.filter((cookie) => cookie.startsWith(`${name}=`));
  assert.equal(pair.length, 2, name);
  for (const cookie of pair) {
    assert.match(cookie, /Max-Age=0/i);
    assert.match(cookie, /Expires=Thu, 01 Jan 1970/i);
  }
}
const studio = await get("/studio/live-preview/");
assert.equal(studio.status, 200);
assert.match(studio.headers.get("x-robots-tag"), /noindex/);
const studioHtml = await studio.text();
assert.doesNotMatch(studioHtml, /id="site-root"|fiskum-organization-jsonld/);
const script = studioHtml.match(/src="(\/studio\/static\/[^\"]+\.js)"/);
assert.ok(script);
assert.equal((await get(script[1])).status, 200);
for (const path of ["/bad%ZZ/", "/bad%2/"]) {
  const status = await new Promise((resolve, reject) => {
    const url = new URL(origin);
    const request = httpRequest(
      { hostname: url.hostname, port: url.port, path, method: "GET" },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
    request.end();
  });
  assert.equal(status, 404, path);
}
const missing = await get("/finnes-ikke/");
assert.equal(missing.status, 404);
const missingHtml = await missing.text();
assert.match(missingHtml, /Siden finnes ikke/);
assert.match(missingHtml, /name="robots" content="noindex"/);
assert.equal((await get("/api/forms/contact")).status, 405);
console.log(
  JSON.stringify({
    ok: true,
    publishedRoutes: count,
    forgedCookiesPublicOnly: true,
    retiredRoutes: 410,
    ordinaryAndPartitionedLogoutCookies: 8,
    isolatedStudio: true,
    malformedPaths: 404,
    formsReadDenied: 405,
    missingReader: process.env.EXPECT_MISSING_READER === "1",
  }),
);
