import assert from "node:assert/strict";
import test from "node:test";
import { resolvePreviewSettings } from "../lib/preview-settings.ts";
import { organizationJsonLd, pageMetadata } from "../lib/metadata.mjs";
import { testSettings, testImage } from "./support/fixtures.mjs";
test("authorized selected global SEO keeps valid draft fields and independently falls back for invalid required fields", () => {
  const selected = {
    ...testSettings,
    defaultSeo: {
      title: "Valgt utkasttittel",
      description: "Valgt utkastbeskrivelse",
      image: null,
    },
  };
  const resolved = resolvePreviewSettings(selected, testSettings);
  assert.equal(resolved.defaultSeo.title, selected.defaultSeo.title);
  assert.equal(
    resolved.defaultSeo.description,
    selected.defaultSeo.description,
  );
  assert.equal(resolved.defaultSeo.image, testImage);
  const data = {
    settings: resolved,
    document: { _type: "page", title: "Kontroll" },
  };
  assert.equal(pageMetadata(data, "/").description, "Valgt utkastbeskrivelse");
  assert.equal(
    organizationJsonLd(resolved).description,
    "Valgt utkastbeskrivelse",
  );
  const partial = resolvePreviewSettings(
    {
      ...selected,
      siteName: " ",
      defaultSeo: {
        title: " ",
        description: "Gyldig",
        image: { ...testImage, alt: "" },
      },
    },
    testSettings,
  );
  assert.equal(partial.siteName, testSettings.siteName);
  assert.equal(partial.defaultSeo.title, testSettings.defaultSeo.title);
  assert.equal(partial.defaultSeo.description, "Gyldig");
  assert.equal(partial.defaultSeo.image, testImage);
});
test("valid selected draft never masks invalid published global defaults", () => {
  assert.throws(
    () =>
      resolvePreviewSettings(testSettings, {
        ...testSettings,
        defaultSeo: { ...testSettings.defaultSeo, image: null },
      }),
    /globale SEO/,
  );
  assert.throws(
    () =>
      pageMetadata(
        {
          settings: { ...testSettings, siteName: "" },
          document: { _type: "page", title: "Kontroll" },
        },
        "/",
      ),
    /globale SEO/,
  );
});
