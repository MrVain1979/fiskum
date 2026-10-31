# Fiskum

The existing Fiskum design and renderer are shared by the public Next app and the optional static exporter. `lib/render-content.mjs` contains the rendering functions formerly in `scripts/build-static.mjs`; the latter remains the CLI and compatibility re-export. Server Functions do not import the filesystem exporter.

Use Node 24 and the pinned pnpm version. Install the root package and the standalone Studio separately, as specified in `vercel.json`. `pnpm run build` builds Studio and the public app. `pnpm test`, `pnpm run typecheck`, and `pnpm --dir sanity-studio exec tsc --noEmit` check the source. `pnpm run sanity:typegen` extracts the real Studio schema and generates contracts for all 15 active named queries in `lib/sanity-projections.ts`.

The coordinated Next 16 / React 19 / next-sanity 13 and Studio 6 pins provide native Partitioned preview cookies and current schema registration. The prior next-sanity 10 enable handler lacked CHIPS support. Compatible Studio plugins are pinned; the former Sanity 3-only icon plugin is replaced by native patches that preserve the complete Feather catalogue and the four original SVGs.

## CMS model

All five existing public document types have reusable `sections`, an independent visible `intro`, SEO, automatic previous URL history, and stable existing routes. Ordinary pages can reference a published parent, up to three levels including descendants. Moving a page does not change its flat URL. Strong references, published reference projections, URL collision validation, and the native Publish wrapper preserve safe rename/unpublish behavior.

The 14 section types use the existing design: hero, CTA, icon cards, linked image cards, FAQ, newsletter request, carousel, rich text, gallery, PDFs, the existing shared content lists, side quote, contact information, and contact form. They can repeat, reorder, hide, and expose relevant spacing, background, width, anchor and placement controls. Hero/CTA appearance is an explicit layout field. The original four custom service SVGs are stored in each service's editable icon field. Legacy content fields remain archived for compatibility; runtime rendering reads the new sections model.

Global `siteName` and `defaultSeo` are separate from page SEO. A sharing image must be a supported raster asset with alt text and at least 1200 × 630 pixels remaining after crop. Rendering selects a valid page SEO image, then a valid global default. Hero/gallery fields do not become sharing fallbacks at runtime. Metadata, canonical, social tags, LocalBusiness and per-page WebPage/Article/BreadcrumbList JSON-LD use CMS values and the selected perspective without stega. Canonical targets elsewhere are excluded from sitemap, and canonical-only changes invalidate it. Draft Mode and Vercel Preview suppress indexing and canonical tags.

## Live Preview and private Inbox

Studio is isolated at `/studio`. Native Presentation uses `/api/draft-mode/enable` and the actual public routes, the installed SDK perspective/variant cookie resolvers, native live updates and Visual Editing. Explicit keyed image/icon and computed date/social targets supplement visible text stega. A perspective-derived key wraps only public children, with a local public404 boundary beneath it, so Drafts → Published404 → Drafts recovers the same route. Anonymous keys stay constant and read no perspective cookies. The first visible carousel controls the H1, with page/global fallbacks; metadata uses the same visible-heading fallback. Replaced HTML rebinds the existing menu, independent carousels, galleries and forms with cleanup.

`SANITY_API_READ_TOKEN` is a server-only read token. `browserToken` and preview sharing are disabled: this project also contains private Inbox documents. The published business dataset is public, but Sanity restricts every dotted document ID to authenticated reads. Inbox writes always use `formSubmission.<uuid>` and a separate `SANITY_FORM_WRITE_TOKEN`; public content queries use an explicit business-type whitelist and never query submissions. See [Sanity IDs and paths](https://www.sanity.io/docs/content-lake/ids).

`NativeVisualEditing` uses the installed SDK's `refresh` prop for both native mutation and manual events. The default SDK handler ignores mutations, which left an autosaved image crop stale until the editor pressed Refresh. The callback refreshes the authorized server-rendered route and returns the SDK-style completion promise; it adds no polling, message bridge or browser credential.

The existing contact form and its notification behavior remain intact. A published visible newsletter section enables an explicit consent-based **request** in the same Inbox, with no mailing-list provider, automatic enrollment, or external email. In Preview, both form types cannot submit. The old `/preview` and `/preview/session` routes return 410.

The native exit endpoint checks the exact configured origin and returns raw expiration headers for all four SDK cookies in ordinary and Partitioned forms. Local HTTP checks can set `FRONTEND_ORIGIN=http://localhost:<port>`. In production the default is the established Fiskum domain; Vercel Preview uses its exact trusted deployment URL.

## Targeted publication cache

Published queries retain the existing Next Data Cache and signed webhook. Native Preview bypasses it. The existing `/api/revalidate` expires document, shell, collection, route and reference tags as appropriate, including transitive FAQ/image/file references and historical redirects. `sanity-studio/webhook.groq` contains the exact projection. The Sanity webhook must include `previousPaths`, `"canonical": seo.canonical`, `"parentId": parent._ref`, `title` and `navigationTitle` in **both** `before` and `after`, in addition to its existing `_id`, `_type`, `slug`, `publishedAt`, `seoNoIndex` and redirect `from` fields. Native Publish persists history with a current-revision guard before publishing.

The sitemap XML is the exception: its route is dynamic and reads the published index on each request. A static XML response remained unchanged after two successful publication webhooks. Its existing route query, canonical/noindex filtering, sitemap tag and webhook path remain the same; page caches keep their targeted behavior. After building, `node tests/sitemap-http.mjs` exercises the actual local production HTTP route with an isolated CMS fixture through publication, rename, noindex, alternate canonical and unpublication, without CMS writes or manual invalidation.

## Additive migration and acceptance

`sanity-studio/scripts/read-full-313.mjs` reads only authenticated raw business documents and asset metadata, excluding submissions/secrets. It writes snapshots outside Git. `scripts/migrate-full-313.mjs` is dry-run only, creates explicit before/after documents and revision-guarded `setIfMissing` patches, and deliberately has no write mode. Each draft is transformed from its own values. Every pre-existing leaf and legacy array order/length is retained; new URL targets can be added inside legacy objects that old production ignores.

The reviewed migration was applied externally after a full verified backup. Local snapshots, plans, validation output and draft-sensitive historical HTML stay outside Git. The readback matches all 26 expected after-documents except revision/time, and rerunning the model yields zero mutations. Offline review checks all 20 published and 20 draft-perspective routes against the historical renderer, including visible text, links, image identities, original SVGs, sharing artwork and crop.

Source tests and HTTP checks do not certify the authenticated Studio experience. Release acceptance still includes real Native Presentation login, text/image clicks, Drafts → Published → Drafts updates, slug/hierarchy/section changes, publish/unpublish and direct exit in supported browsers. Credentials, Studio registration, webhook configuration and deployment are managed separately from the source work.
