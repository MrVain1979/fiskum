// Optional read-only integration check against the configured published dataset.
// Does not print content, draft data, request URLs or credentials.
import assert from "node:assert/strict";
import { allDocuments, contentQuery, documentBody } from "../scripts/build-static.mjs";
import { documentPath } from "../lib/sanity-cache.mjs";
import { fetchPageData, sanityQuery } from "../lib/sanity-content.mjs";

const full = await sanityQuery(contentQuery(), {}, [], fetch, true);
let checked = 0;
for (const document of allDocuments(full)) {
  const path = documentPath(document);
  const target = await fetchPageData(path);
  assert(target.document, `Targeted query lost ${path}`);
  assert.equal(documentBody({ ...target.data, document: target.document }, path), documentBody({ ...full, document }, path), `Renderer parity failed at ${path}`);
  checked += 1;
}
console.log(JSON.stringify({ ok: true, publishedRoutesWithIdenticalHtml: checked }));
