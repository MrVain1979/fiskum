# Sanity publishing — Fiskum

This project uses Next.js 15.5.21's Data Cache and one signed Sanity webhook. Ordinary publishing must not call a Vercel Deploy Hook. Code or configuration changes still need a deployment. The webhook invalidates data and paths; Next.js regenerates them on a subsequent request. It uses the Next 15 one-argument `revalidateTag(tag)` API.

## Exact webhook settings

- Project: `qgyys6fw`; dataset: `production`.
- URL: `https://www.fiskum-sveis.no/api/revalidate` (direct canonical host).
- Method: POST; events: create, update and delete.
- API version: `v2021-03-25` or newer.
- Draft and version events: disabled.
- Secret: the existing `SANITY_REVALIDATE_SECRET` in Vercel Production. Never put its value in code or this document.
- Keep exactly one active publishing webhook. Remove the obsolete `sanity-content-rebuild` Vercel Deploy Hook once confirmed unused; it is not part of this publishing model.

Filter (copy exactly):

```groq
coalesce(after()._type, before()._type) in ["homePage", "page", "service", "projectReference", "newsPost", "settings", "navbar", "footer", "faq", "redirect", "sanity.imageAsset", "sanity.fileAsset"]
&& !(coalesce(after()._id, before()._id) in path("drafts.**"))
&& !(coalesce(after()._id, before()._id) in path("versions.**"))
```

Projection (copy exactly):

```groq
{
  "_id": coalesce(after()._id, before()._id),
  "_type": coalesce(after()._type, before()._type),
  "before": before(){_id, _type, "slug": slug.current, publishedAt, from, seoNoIndex},
  "after": after(){_id, _type, "slug": slug.current, publishedAt, from, seoNoIndex}
}
```

Both keys must exist; the missing state is `null` for creation or deletion. The receiver rejects the old incomplete payload with HTTP 400. Coordinate this saved configuration with deployment of the new receiver and verify an actual signed delivery after saving.

## Data and invalidation contract

All public queries use the published perspective and explicitly exclude draft/version IDs. Preview uses its separate authorized, uncached fetch path.

| Cached data | Actual consumers | Invalidated by |
| --- | --- | --- |
| Route candidate identity for one URL (including empty results) | That page and its metadata | Creation, deletion, slug/date changes at old and new URL; `/category/aktuelt/` maps to `/aktuelt/` |
| Full document by ID | Its page and metadata, with existing duplicate-route merging retained | Its publication; changed referenced FAQ/asset; linked target creation/deletion/URL change |
| Settings, navbar and footer separately | Every page's actual shared shell | That singleton; a relevant linked URL or referenced asset change |
| Service summaries | Home, `/tjenester/`, the four existing service sidebar paths | Service publication/removal/URL changes |
| Reference summaries and first image | `/referanser/` | Reference changes and its referenced image asset |
| News summaries and image | Home, `/aktuelt/`, category alias | News changes, date/slug changes and image asset |
| FAQ content | Home; document queries also embed explicitly referenced FAQs | FAQ changes and referenced assets |
| Redirect lookup for one missing URL | That missing URL | Redirect changes at its old/new `from`; linked destination URL changes |
| Small route index (identity and noindex only) | Build route enumeration and sitemap | Route create/delete/URL change or `seoNoIndex`; never ordinary body text |

There is no shared all-content tag. A change to a global navigation link necessarily updates the global navigation on pages that use it. An unrelated service body edit leaves other document fetches and the route index cached.

The receiver looks up published documents containing references when an asset, FAQ or route identity changes. It follows transitive references, so an image inside a referenced FAQ updates that FAQ's consumer. Before/after identities retain deleted or renamed URLs. Direct asset metadata changes are included, including dimensions used to compute image crop URLs and file URLs. Literal editorial URL strings are intentionally literal; automatic slug following requires an internal Sanity reference.

`author`, `blog` and `blogIndex` exist in Studio but are not queried or rendered by this website. They are excluded from the filter. The receiver acknowledges unsupported types and draft/version IDs as ignored, with no invalidation. Malformed bodies, missing/invalid signatures and failed reference lookups do not return false success. A failed lookup returns 500 for Sanity retry.

Runtime rendering has no migration minimum for services, references or news. Missing content produces 404 only for its own route; actual lists and references follow published content.

## Regression and production verification

Run `node --test tests/*.test.mjs` after installing dependencies. Cache tests execute the real GROQ projections through `groq-js`, actual `fetchPageData`, the renderer and an in-memory tagged cache. They cover preserved renderer output, unrelated cache retention, cached 404/create, two renames, direct deletion, unpublishing, dated news, referencing pages before detail visits, redirects, asset/FAQ/file dependencies, draft isolation and metadata/sitemap noindex.

These tests do not prove the saved webhook, Vercel environment, actual preview authorization or production deployment history. Record controlled draft/publish/restore, image, URL/reference, unpublish/delete and asset-metadata tests separately, with original content restored and zero CMS-triggered deployments throughout that window.

References: [Sanity webhook filters/projections](https://www.sanity.io/docs/content-lake/webhooks), [Next.js 15 cache behavior](https://nextjs.org/docs/15/app/guides/caching).
