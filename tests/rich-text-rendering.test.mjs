import assert from "node:assert/strict";
import test from "node:test";
import { documentBody } from "../scripts/build-static.mjs";

const block = (text, extra = {}) => ({
  _type: "block",
  children: [{ _type: "span", text }],
  ...extra,
});
const render = (body) =>
  documentBody(
    {
      settings: {},
      document: {
        _type: "page",
        title: "Kontroll",
        sections: [{ _type: "richTextSection", richText: body }],
      },
    },
    "/kontroll/",
  );

test("actual renderer keeps paragraphs, hard breaks and whitespace between marked spans", () => {
  const html = render([
    block("Avsnitt A."),
    block(" \n "),
    {
      _type: "block",
      children: [
        { text: "Linje ", marks: ["strong"] },
        { text: "B\nNy linje." },
      ],
    },
  ]);
  assert.match(
    html,
    /<p>Avsnitt A\.<\/p><p><strong>Linje <\/strong>B<br>Ny linje\.<\/p>/,
  );
});

test("actual renderer groups ordered, bullet and nested lists and closes groups before paragraphs", () => {
  const html = render([
    block("A", { listItem: "bullet", level: 1 }),
    block("A.1", { listItem: "number", level: 2 }),
    block("A.2", { listItem: "number", level: 2 }),
    block("B", { listItem: "bullet", level: 1 }),
    block("C", { listItem: "number", level: 1 }),
    block("Etter listen."),
  ]);
  assert.match(
    html,
    /<ul><li>A<ol><li>A\.1<\/li><li>A\.2<\/li><\/ol><\/li><li>B<\/li><\/ul><ol><li>C<\/li><\/ol><p>Etter listen\.<\/p>/,
  );
});

test("actual renderer follows projected internal references, escapes link text and preserves new-tab setting", () => {
  const body = [
    {
      _type: "block",
      children: [{ text: "A & B", marks: ["link", "strong"] }],
      markDefs: [
        {
          _key: "link",
          _type: "customLink",
          customLink: {
            target: {
              kind: "internal",
              document: { _id: "target", _type: "page", slug: "/maal/" },
            },
            openInNewTab: true,
          },
        },
      ],
    },
  ];
  assert.match(
    render(body),
    /<a href="\/maal\/" target="_blank" rel="noopener noreferrer"><strong>A &amp; B<\/strong><\/a>/,
  );
  body[0].markDefs[0].customLink.target.document = null;
  const html = render(body);
  assert.match(html, /<strong>A &amp; B<\/strong>/);
  assert.doesNotMatch(html, /href="\/maal\/"/);
});

test("unsafe or malformed Portable Text URLs render text without an anchor", () => {
  for (const href of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "//evil.example",
    "/%2fevil.example",
    "/%5cevil.example",
    "/%00path",
    "/bad%",
    "https://user:secret@example.com/",
  ]) {
    const html = render([
      {
        _type: "block",
        children: [{ text: "Trygg tekst", marks: ["link"] }],
        markDefs: [{ _key: "link", _type: "link", href }],
      },
    ]);
    assert.match(html, /<p>Trygg tekst<\/p>/, href);
  }
  for (const href of [
    "https://example.com/?a=1&b=2",
    "mailto:post@example.com",
    "tel:+4712345678",
    "#kontakt",
  ]) {
    assert.match(
      render([
        {
          _type: "block",
          children: [{ text: "Lenke", marks: ["link"] }],
          markDefs: [{ _key: "link", _type: "link", href }],
        },
      ]),
      /<a href="[^\"]+">Lenke<\/a>/,
    );
  }
});
