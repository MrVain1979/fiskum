import assert from "node:assert/strict";
import test from "node:test";
import { documentBody, pageMetadata } from "../scripts/build-static.mjs";
import {
  contentPath,
  slugError,
  canonicalOverride,
} from "../lib/content-path.ts";
import { resolveSanityImage } from "../lib/image.ts";
import { socialImage } from "../lib/social-image.ts";
import { annotateOwners } from "../lib/preview-owners.mjs";
import { renderedSectionTypes } from "../lib/section-renderer.mjs";
import {
  validateParent,
  validateRouteSlug,
} from "../sanity-studio/schemaTypes/content-validation.ts";
import { testSettings, testImage, projectedLink } from "./support/fixtures.mjs";
const text = (value) => [
  { _type: "block", children: [{ _type: "span", text: value }] },
];
const data = (sections) => ({
  settings: testSettings,
  document: { _id: "page", _type: "page", title: "Eksempel", sections },
  services: [],
  references: [],
  newsPosts: [],
});

test("every actual catalogue section renders, repeats, reorders and obeys hide/spacing/anchor controls", () => {
  const fixtures = {
    hero: { title: "Teksttopp" },
    cta: { title: "Handling" },
    featureCardsIcon: {
      title: "Fordeler",
      cards: [{ title: "Fordel", richText: text("Godt") }],
    },
    imageLinkCards: {
      cards: [
        { title: "Kort", url: projectedLink({ _type: "page", slug: "side" }) },
      ],
    },
    faqAccordion: {
      title: "Spørsmål",
      faqs: [{ title: "Spørsmål?", richText: text("Svar") }],
    },
    subscribeNewsletter: { title: "Nyhetsbrev" },
    heroCarousel: { title: "Bildetopp", images: [testImage] },
    richTextSection: { richText: text("Brødtekst") },
    gallerySection: { images: [testImage] },
    pdfSection: {
      files: [
        {
          title: "Dokument",
          url: "https://cdn.sanity.io/files/qgyys6fw/production/test.pdf",
        },
      ],
    },
    collectionSection: { collection: "service", title: "Samling" },
    quoteSection: { quote: "Sitat" },
    contactInformation: { contactPeople: [{ name: "Person" }] },
    contactFormSection: { title: "Kontaktskjema" },
  };
  assert.deepEqual(
    Object.keys(fixtures).sort(),
    [...renderedSectionTypes].sort(),
  );
  for (const [type, fields] of Object.entries(fixtures)) {
    const first = {
      _type: type,
      _key: "first",
      ...fields,
      anchor: "first-anchor",
      paddingTop: 40,
      paddingBottom: 120,
      background: "light",
      maxWidth: "narrow",
    };
    const second = { ...first, _key: "second", anchor: "second-anchor" };
    const model = data([
      second,
      first,
      { ...first, _key: "hidden", hidden: true },
    ]);
    model.settings = {
      ...testSettings,
      contactFormEnabled: true,
      contactEmail: "office@example.test",
    };
    const html = documentBody(model, "/eksempel/");
    assert.ok(
      html.indexOf('data-section-key="second"') <
        html.indexOf('data-section-key="first"'),
      type,
    );
    assert.doesNotMatch(html, /data-section-key="hidden"/, type);
    assert.match(html, /id="first-anchor"/, type);
    assert.match(html, /padding-top:40px/, type);
    assert.match(html, /padding-bottom:120px/, type);
    assert.match(html, /cms-background-light/, type);
    assert.match(html, /max-width:760px/, type);
  }
});
test("explicit layout variants remain stable after moving or repeating the old design sections", () => {
  const proof = {
    _type: "cta",
    _key: "proof",
    layout: "proof",
    title: "Begrunnelse",
    image: testImage,
  };
  const first = documentBody(
    data([proof, { _type: "cta", title: "Annet" }]),
    "/side/",
  );
  const second = documentBody(
    data([{ _type: "cta", title: "Annet" }, proof]),
    "/side/",
  );
  for (const html of [first, second])
    assert.match(
      html,
      /class="section cms-block home-proof cms-section"[^>]*data-section-key="proof"/,
    );
});
test("crop/hotspot, decorative alt and exact keyed image owner survive repeated section projections", () => {
  const image = {
    ...testImage,
    _key: "photo",
    crop: { left: 0.1, right: 0.1, top: 0, bottom: 0 },
    hotspot: { x: 0.4, y: 0.5, width: 0.2, height: 0.2 },
  };
  const resolved = resolveSanityImage(image);
  assert.equal(
    new URL(resolved.src).searchParams.get("rect"),
    "190,0,1520,1000",
  );
  assert.equal(resolved.objectPosition, "37.5% 50%");
  const model = annotateOwners(
    data([{ _type: "gallerySection", _key: "gallery", images: [image] }]),
  );
  assert.deepEqual(model.document.sections[0].images[0]._editOwner, {
    id: "page",
    type: "page",
    path: ["sections", { _key: "gallery" }, "images", { _key: "photo" }],
  });
  const html = documentBody(model, "/side/");
  assert.match(html, /data-sanity="[^"]+"/);
  assert.match(html, /rect=190%2C0%2C1520%2C1000/);
  const faq = annotateOwners({
    _id: "page",
    _type: "page",
    sections: [
      {
        _key: "faq-section",
        faqs: [
          {
            _id: "faq-id",
            _type: "faq",
            richText: [{ ...image, _key: "faq-photo" }],
          },
        ],
      },
    ],
  });
  assert.deepEqual(faq.sections[0].faqs[0].richText[0]._editOwner, {
    id: "faq-id",
    type: "faq",
    path: ["richText", { _key: "faq-photo" }],
  });
  assert.equal(
    socialImage({
      ...image,
      crop: { left: 0.4, right: 0.4, top: 0, bottom: 0 },
    }),
    null,
  );
});
test("hierarchy validates descendants and cycles without changing existing flat paths", async () => {
  const records = [
    { _id: "a" },
    { _id: "b", parent: { _ref: "a" } },
    { _id: "c", parent: { _ref: "b" } },
    { _id: "d" },
  ];
  const client = {
    withConfig() {
      return this;
    },
    fetch: async () => records,
  };
  const context = {
    document: { _id: "a", _type: "page" },
    getClient: () => client,
  };
  assert.match(await validateParent({ _ref: "c" }, context), /sirkel/);
  assert.match(await validateParent({ _ref: "d" }, context), /tre nivåer/);
  assert.equal(await validateParent(undefined, context), true);
  assert.equal(
    contentPath({ _type: "page", slug: "/etablert/", parent: { _ref: "a" } }),
    "/etablert/",
  );
  assert.equal(slugError("/studio", "page"), "Denne URL-en er reservert.");
  assert.ok(slugError("nested/slug", "page"));
  const collisionContext = {
    ...context,
    getClient: () => ({
      ...client,
      fetch: async () => [
        {
          _id: "other",
          _type: "page",
          slug: { current: "current" },
          previousPaths: ["/opptatt/"],
        },
      ],
    }),
  };
  assert.match(
    await validateRouteSlug({ current: "opptatt" }, collisionContext),
    /historisk/,
  );
});
test("unicode and literal percent URLs encode once and canonical validation rejects unsafe paths", () => {
  assert.equal(
    contentPath({ _type: "page", slug: "Blå 50%" }),
    "/Bl%C3%A5%2050%25/",
  );
  assert.equal(
    contentPath({ _type: "page", slug: "literal%2F" }),
    "/literal%252F/",
  );
  for (const value of [
    "https://www.fiskum-sveis.no/bad%ZZ/",
    "https://www.fiskum-sveis.no/a%2Fb/",
    "https://www.fiskum-sveis.no/%2e%2e/",
    "https://www.fiskum-sveis.no/path?query=1",
  ])
    assert.ok(canonicalOverride(value).error, value);
});
test("newsletter preview makes no enrollment promise and cannot submit a request", () => {
  const model = {
    ...data([{ _type: "subscribeNewsletter", title: "Nyhetsbrev" }]),
    preview: true,
  };
  const html = documentBody(model, "/");
  assert.match(html, /Send forespørsel om nyhetsbrev/);
  assert.match(html, /data-preview-disabled="true"/);
  assert.match(html, /type="submit" disabled aria-disabled="true"/);
  assert.doesNotMatch(html, /automatisk påmeldt|du er påmeldt/);
});

test("navigation and linked image cards honor the configured new-tab setting", () => {
  const link = {
    ...projectedLink({ _type: "page", slug: "maal" }),
    openInNewTab: true,
  };
  const model = data([
    { _type: "imageLinkCards", cards: [{ title: "Bildekort", url: link }] },
  ]);
  model.navbar = {
    columns: [{ _type: "navbarLink", name: "Menylenke", url: link }],
  };
  const html = documentBody(model, "/");
  assert.equal(
    (
      html.match(
        /href="\/maal\/" target="_blank" rel="noopener noreferrer"/g,
      ) || []
    ).length,
    3,
  );
});
test("a first page carousel retains ancestor breadcrumbs and uses the public title", () => {
  const model = data([{ _type: "heroCarousel", title: "Synlig bildetittel" }]);
  model.document = {
    ...model.document,
    slug: "barn",
    parent: {
      _id: "parent",
      _type: "page",
      title: "Forelder",
      slug: "forelder",
    },
  };
  const html = documentBody(model, "/barn/");
  assert.match(html, /class="breadcrumbs"/);
  assert.match(html, /href="\/forelder\/">Forelder/);
  assert.match(html, /<h1>Synlig bildetittel<\/h1>/);
});
