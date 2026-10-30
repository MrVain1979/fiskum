import assert from "node:assert/strict";
import test from "node:test";
import {
  documentBody,
  pageHtml,
  pageLead,
  pageMetadata,
} from "../scripts/build-static.mjs";
import {
  testSettings as settings,
  testImage,
  projectedLink,
} from "./support/fixtures.mjs";
const block = (text) => ({
  _type: "block",
  children: [{ _type: "span", text }],
});
const dataFor = (document, extra = {}) => ({ settings, document, ...extra });

test("sharing uses only valid page SEO then valid global defaults, never hero/gallery candidates", () => {
  const document = {
    _type: "page",
    title: "Tjenester",
    sections: [
      { _type: "heroCarousel", title: "Våre tjenester", images: [testImage] },
    ],
    seo: {
      image: {
        ...testImage,
        asset: {
          ...testImage.asset,
          metadata: { dimensions: { width: 500, height: 300 } },
        },
      },
    },
  };
  const data = dataFor(document),
    image = pageMetadata(data, "/tjenester/").openGraph.images[0];
  assert.equal(image.width, 1200);
  assert.equal(image.height, 630);
  assert.ok(image.alt);
  assert.match(image.url, /abcd-1900x1000/);
  assert.equal(new URL(image.url).searchParams.get("w"), "1200");
  assert.match(pageHtml(data, "/tjenester/"), /property="og:image:alt"/);
  assert.match(pageHtml(data, "/tjenester/"), /name="twitter:image:alt"/);
  assert.throws(
    () =>
      pageMetadata(
        {
          ...data,
          settings: {
            ...settings,
            defaultSeo: { ...settings.defaultSeo, image: null },
          },
        },
        "/",
      ),
    /globale SEO/,
  );
});
test("blank SEO follows visible section text while retaining the visible lead", () => {
  const document = {
    _type: "page",
    title: "Kranutleie",
    intro: " ",
    seo: { title: " \n ", description: "\t" },
    sections: [
      {
        _type: "richTextSection",
        richText: [block("Løft og transport.\nTa kontakt for informasjon.")],
      },
    ],
  };
  const before = JSON.stringify(document),
    metadata = pageMetadata(dataFor(document), "/kranutleie/");
  assert.equal(metadata.title, "Kranutleie - Testbedrift");
  assert.equal(
    metadata.description,
    "Løft og transport. Ta kontakt for informasjon.",
  );
  assert.equal(metadata.openGraph.description, metadata.description);
  assert.equal(pageLead(document), " ");
  assert.equal(JSON.stringify(document), before);
});
test("explicit metadata and canonical win; preview suppresses canonical and indexing", () => {
  const document = {
    _type: "page",
    title: "Nyhet",
    seo: {
      title: "Valgt tittel",
      description: "Valgt beskrivelse",
      ogTitle: "Delingstittel",
      ogDescription: "Delingsbeskrivelse",
      canonical: "https://www.fiskum-sveis.no/valgt/",
    },
  };
  const data = dataFor(document),
    metadata = pageMetadata(data, "/nyhet/");
  assert.equal(metadata.title, "Valgt tittel - Testbedrift");
  assert.equal(metadata.description, "Valgt beskrivelse");
  assert.equal(metadata.openGraph.title, "Delingstittel");
  assert.equal(
    metadata.alternates.canonical,
    "https://www.fiskum-sveis.no/valgt/",
  );
  assert.equal(
    pageMetadata(data, "/nyhet/", { preview: true }).alternates.canonical,
    undefined,
  );
  assert.deepEqual(pageMetadata(data, "/nyhet/", { preview: true }).robots, {
    index: false,
    follow: false,
  });
  const html = pageHtml(data, "/nyhet/", { preview: true });
  assert.equal((html.match(/name="robots"/g) || []).length, 1);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.throws(
    () =>
      pageMetadata(
        dataFor({ ...document, seo: { canonical: "https://evil.test/" } }),
        "/",
      ),
    /produksjonsdomenet/,
  );
});
test("noindex and canonical agree across Next metadata and standalone renderer", () => {
  const data = dataFor({ _type: "page", title: "Kontroll", seoNoIndex: true });
  assert.deepEqual(pageMetadata(data, "/kontroll/").robots, {
    index: false,
    follow: true,
  });
  assert.match(
    pageHtml(data, "/kontroll/"),
    /name="robots" content="noindex, follow"/,
  );
  assert.match(
    pageHtml(data, "/kontroll/"),
    /rel="canonical" href="https:\/\/www\.fiskum-sveis\.no\/kontroll\/"/,
  );
});
test("first visible hero and fallback yield one nonempty H1 with the same metadata fallback", () => {
  for (const sections of [
    [{ _type: "heroCarousel", title: "Annen synlig tittel" }],
    [{ _type: "heroCarousel", title: " " }],
    [{ _type: "heroCarousel", hidden: true, title: "Skjult" }],
    [
      { _type: "richTextSection", richText: [block("Start")] },
      { _type: "heroCarousel", title: "Senere hero" },
    ],
    [],
  ]) {
    const data = dataFor({ _type: "homePage", title: "Forsiden", sections });
    const html = documentBody(data, "/");
    const headings = [...html.matchAll(/<h1>(.*?)<\/h1>/g)];
    assert.equal(headings.length, 1);
    assert.ok(headings[0][1].trim());
    assert.equal(pageMetadata(data, "/").openGraph.title, headings[0][1]);
  }
});
test("listing headings remain H2 while home service cards keep H3", () => {
  const services = [{ _type: "service", slug: "stalbygg", title: "Stålbygg" }];
  const listing = documentBody(
    dataFor(
      {
        _type: "page",
        title: "Tjenester",
        sections: [{ _type: "collectionSection", collection: "service" }],
      },
      { services },
    ),
    "/tjenester/",
  );
  assert.match(listing, /<h2 class="card-title">Stålbygg<\/h2>/);
  const home = documentBody(
    dataFor(
      {
        _type: "homePage",
        title: "Forsiden",
        sections: [
          { _type: "hero", layout: "services", title: "Våre tjenester" },
        ],
      },
      { services },
    ),
    "/",
  );
  assert.match(home, /<h3>Stålbygg<\/h3>/);
});

test("cleared visible titles never expose internal working titles", () => {
  const data = dataFor({
    _type: "page",
    title: " ",
    internalTitle: "PRIVATE WORKING TITLE",
    sections: [{ _type: "heroCarousel", title: " " }],
  });
  const html = documentBody(data, "/");
  assert.doesNotMatch(html, /PRIVATE WORKING TITLE/);
  assert.match(html, /<h1>Nettstedet<\/h1>/);
  assert.equal(pageMetadata(data, "/").openGraph.title, "Nettstedet");
});
test("dated news uses Article metadata with real CMS publication and update times", () => {
  const data = dataFor({
    _type: "newsPost",
    title: "Nyhet",
    publishedAt: "2026-03-04T12:00:00Z",
    _updatedAt: "2026-03-05T13:00:00Z",
  });
  const metadata = pageMetadata(data, "/2026/03/04/nyhet/");
  assert.equal(metadata.openGraph.type, "article");
  assert.equal(metadata.openGraph.publishedTime, data.document.publishedAt);
  assert.equal(metadata.openGraph.modifiedTime, data.document._updatedAt);
  assert.match(
    pageHtml(data, "/2026/03/04/nyhet/"),
    /property="article:published_time" content="2026-03-04T12:00:00Z"/,
  );
});
test("unpublished references disappear without default homepage links", () => {
  const data = dataFor(
    {
      _type: "page",
      title: "Lenker",
      sections: [
        {
          _type: "imageLinkCards",
          title: "Relatert",
          cards: [
            { title: "Avpublisert", url: projectedLink(null) },
            { title: "Uten slug", url: projectedLink({ _type: "page" }) },
            { title: "Forsiden", url: projectedLink({ _type: "homePage" }) },
          ],
        },
      ],
    },
    {
      navbar: {
        columns: [
          { _type: "navbarLink", name: "Slettet", url: projectedLink(null) },
        ],
      },
    },
  );
  const html = documentBody(data, "/lenker/");
  assert.doesNotMatch(html, /Avpublisert|Uten slug|Slettet/);
  assert.match(html, /class="page-card" href="\/">.*<h3>Forsiden<\/h3>/);
});
