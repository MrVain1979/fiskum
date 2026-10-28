import assert from "node:assert/strict";
import test from "node:test";
import {
  documentBody,
  pageHtml,
  pageLead,
  pageMetadata,
} from "../scripts/build-static.mjs";

const settings = {
  companyName: "Testbedrift",
  siteTitle: "Nettstedet",
  siteDescription: "Felles beskrivelse fra innstillingene.",
};
const block = (text) => ({
  _type: "block", children: [{ _type: "span", text }],
});
const dataFor = (document, extra = {}) => ({ settings, document, ...extra });

test("image-free indexes and undersized photos receive a full-size sharing card", () => {
  for (const document of [{_type: 'page', title: 'Tjenester'}, {_type: 'page', title: 'Kran', image: {url: 'https://cdn.sanity.io/images/qgyys6fw/production/test-920x690.jpg'}}]) {
    const data = dataFor(document);
    const metadata = pageMetadata(data, '/tjenester/');
    const image = metadata.openGraph.images[0];
    assert.equal(image.width, 1200);
    assert.equal(image.height, 630);
    assert.ok(image.alt);
    assert.equal(new URL(image.url).searchParams.get('w'), '1200');
    assert.match(pageHtml(data, '/tjenester/'), /property="og:image:alt"/);
    assert.match(pageHtml(data, '/tjenester/'), /name="twitter:image:alt"/);
  }
});

test("blank SEO fields fall through real page text without changing the visible lead", () => {
  const document = {
    _type: "page", title: "Kranutleie", seoTitle: " \n ",
    seoDescription: " \t ", description: " ", summary: "\u200B",
    body: [block("Løft og transport.\nTa kontakt for informasjon.")],
    ogTitle: " ", ogDescription: "\t",
  };
  const data = dataFor(document);
  const before = JSON.stringify(document);
  const metadata = pageMetadata(data, "/kranutleie/");
  assert.equal(metadata.title, "Kranutleie - Testbedrift");
  assert.equal(metadata.description, "Løft og transport. Ta kontakt for informasjon.");
  assert.equal(metadata.openGraph.description, metadata.description);
  assert.equal(metadata.openGraph.title, "Kranutleie");
  assert.equal(pageLead(document), " ");
  assert.equal(JSON.stringify(document), before);
  assert.match(pageHtml(data, "/kranutleie/"), /name="description" content="Løft og transport\. Ta kontakt for informasjon\."/);
});

test("explicit metadata wins and whitespace-only content reaches settings fallback", () => {
  const document = {
    _type: "newsPost", title: "Nyhet", description: " ", excerpt: "\t",
    seoTitle: " Valgt tittel ", seoDescription: " Valgt beskrivelse ",
    ogTitle: " Delingstittel ", ogDescription: " Delingsbeskrivelse ",
  };
  const metadata = pageMetadata(dataFor(document), "/nyhet/");
  assert.equal(metadata.title, "Valgt tittel - Testbedrift");
  assert.equal(metadata.description, "Valgt beskrivelse");
  assert.equal(metadata.openGraph.title, "Delingstittel");
  assert.equal(metadata.openGraph.description, "Delingsbeskrivelse");
  assert.equal(pageMetadata(dataFor({ ...document, seoDescription: " " }), "/nyhet/").description, settings.siteDescription);
});

test("noindex and canonical agree across the Next metadata and static/preview renderer", () => {
  const data = dataFor({ _type: "page", title: "Kontroll", seoNoIndex: true });
  const metadata = pageMetadata(data, "/kontroll/");
  assert.deepEqual(metadata.robots, { index: false, follow: true });
  assert.equal(metadata.alternates.canonical, "https://www.fiskum-sveis.no/kontroll/");
  const html = pageHtml(data, "/kontroll/");
  assert.match(html, /name="robots" content="noindex, follow"/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.fiskum-sveis\.no\/kontroll\/"/);
  assert.equal(pageMetadata(dataFor({ _type: "page", seoNoIndex: false }), "/").robots, undefined);
});

test("listing card headings are H2 while home section cards stay H3", () => {
  const services = [{ _type: "service", slug: "stalbygg", title: "Stålbygg" }];
  const references = [{ _type: "projectReference", slug: "bro", title: "En bro" }];
  const servicesHtml = documentBody(dataFor({ _type: "page", title: "Tjenester" }, { services }), "/tjenester/");
  const referencesHtml = documentBody(dataFor({ _type: "page", title: "Referanser" }, { references }), "/referanser/");
  assert.match(servicesHtml, /<h2 class="card-title">Stålbygg<\/h2>/);
  assert.match(referencesHtml, /<h2 class="card-title">En bro<\/h2>/);
  assert.doesNotMatch(servicesHtml + referencesHtml, /<h3[ >]/);
  const home = documentBody(dataFor({ _type: "homePage", title: "Forsiden", pageBuilder: [{ _type: "hero", title: "Våre tjenester" }] }, { services }), "/");
  assert.match(home, /<h2>Våre tjenester<\/h2>/);
  assert.match(home, /<h3>Stålbygg<\/h3>/);
});

test("unpublished internal references disappear instead of linking to the homepage", () => {
  const data = dataFor({
    _type: "page", title: "Lenker", pageBuilder: [{
      _type: "imageLinkCards", title: "Relatert", cards: [
        { title: "Avpublisert", url: { type: "internal", internal: null } },
        { title: "Uten slug", url: { type: "internal", internal: { _id: "other", _type: "page" } } },
        { title: "Forsiden", url: { type: "internal", internal: { _id: "home", _type: "homePage" } } },
      ],
    }],
  }, { navbar: { columns: [
    { _type: "navbarLink", name: "Slettet", url: { type: "internal", internal: null } },
  ] } });
  const html = documentBody(data, "/lenker/");
  assert.doesNotMatch(html, /Avpublisert|Uten slug|Slettet/);
  assert.match(html, /class="page-card" href="\/">.*<h3>Forsiden<\/h3>/);
});
