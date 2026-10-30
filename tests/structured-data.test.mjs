import assert from "node:assert/strict";
import test from "node:test";
import { pageJsonLd, serializeJsonLd } from "../lib/metadata.mjs";
import { pageHtml } from "../lib/render-content.mjs";
import { testSettings } from "./support/fixtures.mjs";
test("structured breadcrumbs follow the visible hierarchy and news alone gets Article dates", () => {
  const document = {
    _type: "newsPost",
    title: "Nyhet",
    slug: "nyhet",
    publishedAt: "2026-03-04T12:00:00Z",
    _updatedAt: "2026-03-05T13:00:00Z",
    listingPage: { _type: "page", title: "Aktuelt", slug: "aktuelt" },
  };
  const graph = pageJsonLd(
    { settings: testSettings, document },
    "/2026/03/04/nyhet/",
  );
  assert.equal(graph[0]["@type"], "Article");
  assert.equal(graph[0].headline, "Nyhet");
  assert.equal(graph[0].datePublished, document.publishedAt);
  assert.equal(graph[1]["@type"], "BreadcrumbList");
  assert.deepEqual(
    graph[1].itemListElement.map((item) => item.name),
    ["Forsiden", "Aktuelt", "Nyhet"],
  );
  assert.ok(graph[1].itemListElement[2].item.endsWith("/2026/03/04/nyhet/"));
  assert.equal(
    pageJsonLd(
      {
        settings: testSettings,
        document: { _type: "page", title: "Side", slug: "side" },
      },
      "/side/",
    )[0]["@type"],
    "WebPage",
  );
});
test("all JSON-LD serializers preserve values while preventing CMS text from closing a script", () => {
  const title = "A < B </script><script>alert(1)</script>";
  const value = { title };
  assert.equal(JSON.parse(serializeJsonLd(value)).title, title);
  assert.ok(!serializeJsonLd(value).includes("<"));
  const html = pageHtml(
    {
      settings: testSettings,
      document: { _type: "page", title, slug: "side" },
    },
    "/side/",
  );
  const serialized = html.match(
    /<script type="application\/ld\+json">(.*?)<\/script>/s,
  )[1];
  const graph = JSON.parse(serialized);
  assert.equal(graph[1].name, title);
  assert.ok(!serialized.includes("<"));
});
