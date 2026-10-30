import type { SettingsQueryResult } from "../sanity.types";
import { metadataText, requireSettings } from "./metadata.mjs";
import { socialImage } from "./social-image.ts";

/** Only an authorized selected perspective may borrow missing required global fields. */
export function resolvePreviewSettings(
  selected: SettingsQueryResult,
  published: SettingsQueryResult,
): NonNullable<SettingsQueryResult> {
  requireSettings(published);
  if (!published) throw new Error("Publiser globale SEO-standarder først.");
  const current = selected ?? published;
  return {
    ...current,
    siteName: metadataText(current.siteName)
      ? current.siteName
      : published.siteName,
    defaultSeo: {
      _type: "seoDefaults",
      title: metadataText(current.defaultSeo?.title)
        ? current.defaultSeo?.title
        : published.defaultSeo?.title,
      description: metadataText(current.defaultSeo?.description)
        ? current.defaultSeo?.description
        : published.defaultSeo?.description,
      image: socialImage(current.defaultSeo?.image)
        ? current.defaultSeo!.image
        : (published.defaultSeo?.image ?? null),
    },
  };
}
