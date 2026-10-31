import { testSettings } from "./support/fixtures.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { pageMetadata, pageHtml } from "../scripts/build-static.mjs";
import sitemap from "../app/sitemap.js";
import robots from "../app/robots.js";
import nextConfig from "../next.config.mjs";

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
