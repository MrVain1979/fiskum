import Script from "next/script";
import { Fragment } from "react";
import { draftMode } from "next/headers";
import { VisualEditing } from "next-sanity/visual-editing";
import { SanityLive } from "../../lib/sanity-live";
import { fetchShellData } from "../../lib/sanity-content.mts";
import { organizationJsonLd, serializeJsonLd } from "../../lib/metadata.mjs";
import { previewRouteKey } from "../../lib/preview-route-key";
import "../../styles.css";
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isEnabled } = await draftMode();
  const routeKey = await previewRouteKey(isEnabled);
  const { settings } = await fetchShellData(fetch, {
    preview: isEnabled,
    stega: false,
  });
  return (
    <>
      <Fragment key={routeKey}>{children}</Fragment>
      <script
        id="fiskum-organization-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(organizationJsonLd(settings)),
        }}
      />
      <Script src="/script.js" strategy="afterInteractive" />
      {isEnabled ? (
        <>
          <aside className="preview-status">
            Forhåndsvisning{" "}
            <a href="/api/draft-mode/disable" target="_top">
              Avslutt direkte forhåndsvisning
            </a>
          </aside>
          <SanityLive includeDrafts />
          <VisualEditing />
        </>
      ) : null}
    </>
  );
}
