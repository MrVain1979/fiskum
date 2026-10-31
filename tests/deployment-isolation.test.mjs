import { testSettings } from "./support/fixtures.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { pageMetadata, pageHtml } from "../scripts/build-static.mjs";
import sitemap from "../app/sitemap.js";
import robots from "../app/robots.js";
import nextConfig from "../next.config.mjs";
import { fetchRouteIndex } from "../lib/sanity-content.mts";
import { sitemapTag } from "../lib/sanity-cache.mjs";

test("preview deployments omit canonical and public sitemap without touching the CMS; production stays indexable", async () => {
  const previous = process.env.VERCEL_ENV;
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("Preview sitemap must not query CMS");
  };
  const data = {
    settings: testSettings,
    document: { _type: "page", title: "Kontroll" },
  };
  try {
    for (const environment of ["preview", "development"]) {
      process.env.VERCEL_ENV = environment;
      assert.equal(
        pageMetadata(data, "/kontroll/").alternates.canonical,
        undefined,
      );
      assert.deepEqual(pageMetadata(data, "/kontroll/").robots, {
        index: false,
        follow: false,
      });
      assert.doesNotMatch(pageHtml(data, "/kontroll/"), /rel="canonical"/);
      assert.deepEqual(await sitemap(), []);
      assert.deepEqual(robots(), { rules: { userAgent: "*", disallow: "/" } });
      assert.ok(
        (await nextConfig.headers()).some(
          (rule) =>
            rule.source === "/:path*" &&
            rule.headers.some(
              (header) =>
                header.key === "X-Robots-Tag" &&
                header.value.includes("noindex"),
            ),
        ),
      );
    }
    process.env.VERCEL_ENV = "production";
    assert.equal(
      pageMetadata(data, "/kontroll/").alternates.canonical,
      "https://www.fiskum-sveis.no/kontroll/",
    );
    assert.deepEqual(pageMetadata(data, "/kontroll/").robots, {
      index: true,
      follow: true,
    });
    assert.equal(robots().rules.allow, "/");
    assert.ok(!robots().rules.disallow.includes("/studio/"));
    const headers = await nextConfig.headers();
    assert.ok(!headers.some((rule) => rule.source === "/:path*"));
    assert.ok(
      headers.some(
        (rule) =>
          rule.source === "/studio/:path*" &&
          rule.headers.some(
            (header) =>
              header.key === "X-Robots-Tag" && header.value.includes("noindex"),
          ),
      ),
    );
  } finally {
    globalThis.fetch = fetchBefore;
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test("production XML reads only the current published index while ordinary route-index callers keep their tagged cache", async () => {
  const previous = process.env.VERCEL_ENV;
  const fixtureEnv = { SANITY_PROJECT_ID: "fixture", SANITY_DATASET: "production", SANITY_API_VERSION: "2025-06-01" };
  const previousEnv = Object.fromEntries(Object.keys(fixtureEnv).map((key) => [key, process.env[key]]));
  const fetchBefore = globalThis.fetch;
  const calls = [];
  let documents = [{ _id: "home", _type: "homePage" }];
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).searchParams.get("perspective"), "published");
    calls.push(init);
    return Response.json({ result: documents });
  };
  try {
    Object.assign(process.env, fixtureEnv);
    process.env.VERCEL_ENV = "production";
    assert.deepEqual((await sitemap()).map((entry) => entry.url), ["https://www.fiskum-sveis.no/"]);
    documents = [...documents, { _id: "new", _type: "page", slug: "new-page" }];
    assert.deepEqual((await sitemap()).map((entry) => entry.url), ["https://www.fiskum-sveis.no/", "https://www.fiskum-sveis.no/new-page/"]);
    assert.ok(calls.every((init) => init.cache === "no-store"));
    await fetchRouteIndex();
    assert.deepEqual(calls.at(-1), { cache: "force-cache", next: { tags: [sitemapTag] } });
  } finally {
    globalThis.fetch = fetchBefore;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});
