import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { allDocuments, contentQuery, documentBody, findRedirect, pageMetadata } from "../scripts/build-static.mjs";
import { documentPath, documentTag, identityChanged, invalidationPlan, needsReferenceLookup, sitemapTag, validateWebhookBody } from "../lib/sanity-cache.mjs";
import { fetchPageData, fetchReferringDocuments, fetchRouteIndex } from "../lib/sanity-content.mjs";

const { parse, evaluate } = await import(process.env.GROQ_JS_MODULE ? pathToFileURL(process.env.GROQ_JS_MODULE).href : "groq-js");
process.env.SANITY_PROJECT_ID = "cachetest";
process.env.SANITY_DATASET = "production";
process.env.SANITY_API_VERSION = "2025-02-19";
const text = (value) => [{ _type: "block", children: [{ _type: "span", text: value }] }];
const link = (id) => ({ type: "internal", internal: { _type: "reference", _ref: id } });
const image = (id) => ({ _type: "image", asset: { _type: "reference", _ref: id }, crop: { left: 0.1, right: 0.1, top: 0, bottom: 0 }, alt: "Testbilde" });
const doc = (id, type, slug, extra = {}) => ({ _id: id, _type: type, title: id, _createdAt: "2026-01-01T00:00:00Z", ...(slug ? { slug: { current: slug } } : {}), ...extra });
const fixture = () => [
  doc("settings", "settings", null, { companyName: "Fiskum", siteTitle: "Fiskum", siteDescription: "Bedriften", phone: "12345678" }),
  doc("navbar", "navbar", null, { columns: [{ _type: "navbarLink", name: "Tjeneste", url: link("service-a") }] }),
  doc("footer", "footer", null, { subtitle: "Fiskum" }),
  doc("home", "homePage", null, { pageBuilder: [{ _type: "hero", title: "Tjenester", richText: text("Intro") }] }),
  doc("services", "page", "tjenester"), doc("references", "page", "referanser"), doc("news", "page", "aktuelt"), doc("contact", "page", "kontakt-oss"),
  doc("faq-page", "page", "faq-side", { pageBuilder: [{ _type: "faqAccordion", title: "Spørsmål", faqs: [{ _type: "reference", _ref: "faq" }] }], pdfFiles: [{ title: "PDF", file: { asset: { _type: "reference", _ref: "file" } } }] }),
  doc("links-page", "page", "lenker", { pageBuilder: [{ _type: "imageLinkCards", title: "Lenker", cards: [{ title: "Prosjektkort", url: link("reference-a") }] }, { _type: "cta", title: "Les mer", buttons: [{ text: "Les nyheten", url: link("news-a") }] }] }),
  ...["a", "b", "c", "d"].map((id, i) => doc(`service-${id}`, "service", ["stalbygg", "vegger", "broer", "trapper"][i], { summary: `Summary ${id}`, body: text(`Body ${id}`), icon: { name: "Wrench" } })),
  doc("reference-a", "projectReference", "prosjekt", { summary: "Referanse", gallery: [image("image")] }),
  doc("news-a", "newsPost", "nyhet", { publishedAt: "2026-02-03T12:00:00Z", excerpt: "Nyhetstekst", mainImage: image("image") }),
  doc("faq", "faq", null, { title: "Spørsmål?", richText: [...text("Svar"), image("image")] }),
  doc("image", "sanity.imageAsset", null, { url: "https://cdn.sanity.io/image.jpg", metadata: { dimensions: { width: 1000, height: 500 } } }),
  doc("file", "sanity.fileAsset", null, { url: "https://cdn.sanity.io/file.pdf" }),
  doc("redirect", "redirect", null, { from: "/gammelt/", to: link("news-a"), permanent: true }),
];

const identity = (value) => value ? { _id: value._id, _type: value._type, slug: value.slug?.current || null, publishedAt: value.publishedAt || null, seoNoIndex: value.seoNoIndex || false, from: value.from || null } : null;
function harness(initial = fixture()) {
  let dataset = structuredClone(initial);
  const cache = new Map();
  const misses = [];
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    const key = String(url);
    if (options.cache !== "no-store" && cache.has(key)) return { ok: true, json: async () => structuredClone(cache.get(key).payload) };
    const parsed = new URL(key);
    assert.equal(parsed.searchParams.get("perspective"), "published");
    const params = Object.fromEntries([...parsed.searchParams].filter(([name]) => name.startsWith("$")).map(([name, value]) => [name.slice(1), JSON.parse(value)]));
    const value = await evaluate(parse(parsed.searchParams.get("query")), { dataset, params });
    const payload = { result: await value.get() };
    misses.push({ url, tags: options.next?.tags || [] });
    if (options.cache !== "no-store") cache.set(key, { payload: structuredClone(payload), tags: options.next.tags });
    return { ok: true, json: async () => payload };
  };
  const get = (id) => structuredClone(dataset.find((item) => item._id === id));
  const set = (id, next) => { dataset = dataset.filter((item) => item._id !== id); if (next) dataset.push(structuredClone(next)); };
  const mutate = async (id, next) => {
    const before = get(id);
    set(id, next);
    const body = { _id: id, _type: (next || before)._type, before: identity(before), after: identity(next) };
    assert.equal(validateWebhookBody(body).error, undefined);
    const parents = needsReferenceLookup(body) ? await fetchReferringDocuments(id, fetcher) : [];
    const plan = invalidationPlan(body, parents);
    for (const [key, value] of cache) if (value.tags.some((tag) => plan.tags.includes(tag))) cache.delete(key);
    return { plan, parents };
  };
  const page = async (path) => {
    const { data, document } = await fetchPageData(path, fetcher);
    return { data, document, html: document ? documentBody({ ...data, document }, path) : null };
  };
  return { fetcher, get, set, mutate, page, misses, calls, dataset: () => dataset };
}

test("targeted GROQ and real renderer preserve the existing complete-query output for every route", async () => {
  const state = harness();
  const full = await (await evaluate(parse(contentQuery()), { dataset: state.dataset() })).get();
  for (const document of allDocuments(full)) {
    const path = documentPath(document);
    const target = await state.page(path);
    assert.equal(target.html, documentBody({ ...full, document }, path), path);
  }
  const alias = await state.page("/category/aktuelt/");
  assert.equal(alias.html, documentBody({ ...full, document: full.pages.find((item) => item.slug === "aktuelt") }, "/category/aktuelt/"));
});

test("service text updates its detail and actual lists without invalidating unrelated documents or route index", async () => {
  const state = harness();
  await Promise.all([state.page("/stalbygg/"), state.page("/tjenester/"), state.page("/"), state.page("/kontakt-oss/"), fetchRouteIndex(state.fetcher)]);
  const next = { ...state.get("service-a"), summary: "Endret tjeneste" };
  const { plan, parents } = await state.mutate("service-a", next);
  assert.equal(parents.length, 0);
  assert(!plan.tags.includes(sitemapTag));
  assert(!plan.tags.includes(documentTag("contact")));
  const before = state.misses.length;
  await state.page("/kontakt-oss/");
  await fetchRouteIndex(state.fetcher);
  assert.equal(state.misses.length, before);
  assert.match((await state.page("/stalbygg/")).html, /Endret tjeneste/);
  assert.match((await state.page("/tjenester/")).html, /Endret tjeneste/);
  assert.match((await state.page("/")).html, /Endret tjeneste/);
});

test("nested page, reference and news slugs keep their existing renderer routes", async () => {
  const nested = fixture().map((value) => ["contact", "reference-a", "news-a"].includes(value._id) ? { ...value, slug: { current: `nested/${value.slug.current}` } } : value);
  const state = harness(nested);
  const full = await (await evaluate(parse(contentQuery()), { dataset: state.dataset() })).get();
  for (const id of ["contact", "reference-a", "news-a"]) {
    const document = allDocuments(full).find((value) => value._id === id);
    const path = documentPath(document);
    const target = await state.page(path);
    assert.equal(target.document?._id, id, path);
    assert.equal(target.html, documentBody({ ...full, document }, path));
  }
  assert.equal((await state.page("/unrelated/nested/nyhet/")).document, null);
});

test("create after cached 404, rename twice, and delete refresh pages, references and sitemap", async () => {
  const state = harness();
  assert.equal((await state.page("/ny-side/")).document, null);
  await fetchRouteIndex(state.fetcher);
  const created = doc("new", "page", "ny-side", { title: "Ny side" });
  await state.mutate("new", created);
  assert.equal((await state.page("/ny-side/")).document.title, "Ny side");
  assert((await fetchRouteIndex(state.fetcher)).some((item) => item._id === "new"));
  for (const slug of ["endret", "endret-igjen"]) {
    const old = documentPath(identity(state.get("new")));
    assert.equal((await state.page(`/${slug}/`)).document, null);
    await state.mutate("new", { ...state.get("new"), slug: { current: slug } });
    assert.equal((await state.page(old)).document, null);
    assert.equal((await state.page(`/${slug}/`)).document._id, "new");
  }
  await state.mutate("new", null);
  assert.equal((await state.page("/endret-igjen/")).document, null);
  assert(!(await fetchRouteIndex(state.fetcher)).some((item) => item._id === "new"));
});

test("linked service rename updates the referencing navbar before the detail route is visited", async () => {
  const state = harness();
  assert.match((await state.page("/kontakt-oss/")).html, /href="\/stalbygg\/"/);
  await state.page("/stalbygg/");
  const { parents } = await state.mutate("service-a", { ...state.get("service-a"), slug: { current: "stalkonstruksjoner" } });
  assert(parents.some((item) => item._id === "navbar"));
  const contact = await state.page("/kontakt-oss/");
  assert.match(contact.html, /href="\/stalkonstruksjoner\/"/);
  assert.doesNotMatch(contact.html, /href="\/stalbygg\/"/);
  assert.equal((await state.page("/stalbygg/")).document, null);
});

test("news date changes update home, dated routes, alias, sitemap and referencing redirect", async () => {
  const state = harness();
  await Promise.all([state.page("/"), state.page("/2026/02/03/nyhet/"), state.page("/2026/04/05/nyhet/"), state.page("/category/aktuelt/"), state.page("/gammelt/"), fetchRouteIndex(state.fetcher)]);
  await state.mutate("news-a", { ...state.get("news-a"), publishedAt: "2026-04-05T12:00:00Z" });
  const oldRedirect = await state.page("/gammelt/");
  assert.equal(findRedirect(oldRedirect.data, "/gammelt/").destination, "/2026/04/05/nyhet/");
  assert.match((await state.page("/")).html, /\/2026\/04\/05\/nyhet\//);
  assert.match((await state.page("/category/aktuelt/")).html, /\/2026\/04\/05\/nyhet\//);
  assert.equal((await state.page("/2026/02/03/nyhet/")).document, null);
  assert.equal((await state.page("/2026/04/05/nyhet/")).document._id, "news-a");
  assert.equal(documentPath((await fetchRouteIndex(state.fetcher)).find((item) => item._id === "news-a")), "/2026/04/05/nyhet/");
});

test("unpublishing a service removes its link without globally failing the other pages", async () => {
  const state = harness();
  for (const path of ["/", "/kontakt-oss/", "/tjenester/", "/referanser/", "/stalbygg/"]) await state.page(path);
  const original = state.get("service-a");
  await state.mutate("service-a", null);
  state.set("drafts.service-a", { ...original, _id: "drafts.service-a" });
  assert.equal((await state.page("/stalbygg/")).document, null);
  for (const path of ["/", "/kontakt-oss/", "/tjenester/", "/referanser/"]) assert((await state.page(path)).html, path);
  assert.doesNotMatch((await state.page("/tjenester/")).html, /href="\/stalbygg\/"/);
  assert.doesNotMatch((await state.page("/kontakt-oss/")).html, />Tjeneste<\/a>/);
});

test("body card/button references update before target visits and disappear on direct deletion", async () => {
  const state = harness();
  const initial = await state.page("/lenker/");
  assert.match(initial.html, /href="\/referanser\/prosjekt\/"/);
  assert.match(initial.html, /href="\/2026\/02\/03\/nyhet\/"/);
  await state.mutate("reference-a", { ...state.get("reference-a"), slug: { current: "nytt-prosjekt" } });
  assert.match((await state.page("/lenker/")).html, /href="\/referanser\/nytt-prosjekt\/"/);
  await state.mutate("news-a", { ...state.get("news-a"), slug: { current: "endret-nyhet" } });
  assert.match((await state.page("/lenker/")).html, /href="\/2026\/02\/03\/endret-nyhet\/"/);
  await state.mutate("reference-a", null);
  await state.mutate("news-a", null);
  assert.doesNotMatch((await state.page("/lenker/")).html, /Prosjektkort|Les nyheten/);
});

test("each singleton updates the actual shared shell; redirect creation/change/deletion replaces cached misses", async () => {
  const state = harness();
  await state.page("/kontakt-oss/");
  for (const [id, patch, expected] of [
    ["settings", { phone: "99990000" }, /99990000/],
    ["navbar", { columns: [{ _type: "navbarLink", name: "Oppdatert meny", url: link("contact") }] }, /Oppdatert meny/],
    ["footer", { subtitle: "Oppdatert bunntekst" }, /Oppdatert bunntekst/],
  ]) {
    await state.mutate(id, { ...state.get(id), ...patch });
    assert.match((await state.page("/kontakt-oss/")).html, expected);
  }
  assert.equal(findRedirect((await state.page("/flyttet/")).data, "/flyttet/"), null);
  await state.mutate("redirect-new", doc("redirect-new", "redirect", null, { from: "/flyttet/", to: link("contact") }));
  assert.equal(findRedirect((await state.page("/flyttet/")).data, "/flyttet/").destination, "/kontakt-oss/");
  await state.mutate("redirect-new", { ...state.get("redirect-new"), from: "/flyttet-igjen/" });
  assert.equal(findRedirect((await state.page("/flyttet/")).data, "/flyttet/"), null);
  assert.equal(findRedirect((await state.page("/flyttet-igjen/")).data, "/flyttet-igjen/").destination, "/kontakt-oss/");
  await state.mutate("redirect-new", null);
  assert.equal(findRedirect((await state.page("/flyttet-igjen/")).data, "/flyttet-igjen/"), null);
});

test("FAQ, transitive image dimensions and file URL changes reach real rendered parents", async () => {
  const state = harness();
  await Promise.all([state.page("/faq-side/"), state.page("/"), state.page("/referanser/"), state.page("/2026/02/03/nyhet/")]);
  await state.mutate("faq", { ...state.get("faq"), title: "Nytt spørsmål?" });
  assert.match((await state.page("/faq-side/")).html, /Nytt spørsmål/);
  assert.match((await state.page("/")).html, /Nytt spørsmål/);
  const asset = state.get("image");
  const { parents } = await state.mutate("image", { ...asset, metadata: { dimensions: { width: 2000, height: 1000 } } });
  assert(parents.some((item) => item._id === "faq-page"));
  assert.match((await state.page("/referanser/")).html, /rect=200,0,1600,1000/);
  assert.match((await state.page("/faq-side/")).html, /rect=200,0,1600,1000/);
  await state.mutate("file", { ...state.get("file"), url: "https://cdn.sanity.io/replaced.pdf" });
  assert.match((await state.page("/faq-side/")).html, /replaced\.pdf/);
  await state.mutate("faq", null);
  assert.doesNotMatch((await state.page("/faq-side/")).html, /Nytt spørsmål/);
  assert.doesNotMatch((await state.page("/")).html, /Nytt spørsmål/);
});

test("noindex updates actual document metadata and sitemap identities without a slug change", async () => {
  const state = harness();
  await state.page("/kontakt-oss/");
  await fetchRouteIndex(state.fetcher);
  await state.mutate("contact", { ...state.get("contact"), seoNoIndex: true });
  const { data, document } = await state.page("/kontakt-oss/");
  assert.equal(pageMetadata({ ...data, document }, "/kontakt-oss/").robots.index, false);
  assert(!(await fetchRouteIndex(state.fetcher)).filter((item) => !item.seoNoIndex).some((item) => item._id === "contact"));
  await state.mutate("contact", { ...state.get("contact"), seoNoIndex: false });
  const indexed = await state.page("/kontakt-oss/");
  assert.equal(pageMetadata({ ...indexed.data, document: indexed.document }, "/kontakt-oss/").robots, undefined);
  assert((await fetchRouteIndex(state.fetcher)).filter((item) => !item.seoNoIndex).some((item) => item._id === "contact"));
});

test("drafts and versions cannot enter public queries; malformed webhook and irrelevant types are explicit", async () => {
  const state = harness();
  state.set("drafts.contact", { ...state.get("contact"), _id: "drafts.contact", title: "DRAFT MARKER" });
  state.set("versions.release.contact", { ...state.get("contact"), _id: "versions.release.contact", title: "RELEASE MARKER" });
  assert.doesNotMatch((await state.page("/kontakt-oss/")).html, /DRAFT MARKER|RELEASE MARKER/);
  assert.deepEqual(validateWebhookBody({ _id: "drafts.contact", _type: "page" }), { ignored: "unpublished" });
  assert.deepEqual(validateWebhookBody({ _id: "versions.release.contact", _type: "page" }), { ignored: "unpublished" });
  assert.deepEqual(validateWebhookBody({ _id: "author", _type: "author" }), { ignored: "unsupported type" });
  assert(validateWebhookBody({ _id: "contact", _type: "page" }).error);
  assert(validateWebhookBody({ _id: "contact", _type: "page", before: null, after: { _id: "wrong", _type: "page" } }).error);
  assert.equal(identityChanged({ _id: "x", _type: "page", slug: "one" }, { _id: "x", _type: "page", slug: "one", title: "Changed" }), false);
});
