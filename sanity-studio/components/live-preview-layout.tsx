import { Box, Card, Flex, Stack, Text } from "@sanity/ui";
import type { CSSProperties } from "react";
import { useMemo } from "react";
import { useEditState, type SanityDocument } from "sanity";
import type { DocumentLayoutProps } from "sanity";

const projectId = "qgyys6fw";
const dataset = "production";

type PortableTextBlock = {
  _type?: string;
  children?: Array<{ text?: string }>;
};

const previewTypes = new Set([
  "homePage",
  "page",
  "service",
  "projectReference",
  "newsPost",
  "settings",
  "navbar",
  "footer",
]);

function getValue(document: Partial<SanityDocument> | null, path: string) {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, document);
}

function getString(document: Partial<SanityDocument> | null, paths: string[]) {
  for (const path of paths) {
    const value = getValue(document, path);
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getSlug(document: Partial<SanityDocument> | null) {
  const slug = getString(document, ["slug.current"]);
  if (!slug) return "/";
  return slug.startsWith("/") ? slug : `/${slug}`;
}

function getRoute(document: Partial<SanityDocument> | null, documentType: string) {
  const slug = getSlug(document);
  if (documentType === "homePage") return "/";
  if (documentType === "projectReference") return `/referanser${slug}/`.replaceAll("//", "/");
  if (documentType === "newsPost") {
    const publishedAt = getString(document, ["publishedAt"]);
    if (publishedAt) {
      const date = new Date(publishedAt);
      if (!Number.isNaN(date.getTime())) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        return `/${yyyy}/${mm}/${dd}${slug}/`.replaceAll("//", "/");
      }
    }
  }
  return `${slug}/`.replaceAll("//", "/");
}

function textFromPortableText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((block: PortableTextBlock) =>
      block?._type === "block"
        ? block.children?.map((child) => child.text).join("") ?? ""
        : "",
    )
    .filter(Boolean)
    .join("\n\n");
}

function imageUrlFromRef(ref?: string) {
  if (!ref?.startsWith("image-")) return "";
  const withoutPrefix = ref.slice("image-".length);
  const lastDash = withoutPrefix.lastIndexOf("-");
  if (lastDash === -1) return "";
  const idAndSize = withoutPrefix.slice(0, lastDash);
  const extension = withoutPrefix.slice(lastDash + 1);
  return `https://cdn.sanity.io/images/${projectId}/${dataset}/${idAndSize}.${extension}?w=1100&fit=max&auto=format`;
}

function getImages(document: Partial<SanityDocument> | null) {
  const gallery = getValue(document, "gallery");
  const mainImageRef = getValue(document, "mainImage.asset._ref");
  const galleryRefs = Array.isArray(gallery)
    ? gallery
        .map((item) =>
          typeof item === "object" && item
            ? getValue(item as Partial<SanityDocument>, "asset._ref")
            : undefined,
        )
        .filter((ref): ref is string => typeof ref === "string")
    : [];
  const refs = typeof mainImageRef === "string" ? [mainImageRef, ...galleryRefs] : galleryRefs;
  return refs.map(imageUrlFromRef).filter(Boolean).slice(0, 6);
}

function renderPreviewHtml(document: Partial<SanityDocument> | null, documentType: string) {
  const title = getString(document, [
    "title",
    "internalTitle",
    "companyName",
    "siteTitle",
    "label",
  ]) || "Uten tittel";
  const intro = getString(document, [
    "summary",
    "excerpt",
    "description",
    "siteDescription",
    "subtitle",
  ]);
  const body = textFromPortableText(getValue(document, "body"));
  const route = getRoute(document, documentType);
  const images = getImages(document);

  return `<!doctype html>
<html lang="no">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: light; --ink: #111111; --muted: #606975; --gold: #e6bd43; --line: #d9d7d0; --paper: #f3f1ec; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Inter, Arial, sans-serif; background: var(--paper); color: var(--ink); }
      header { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 82px; padding: 18px 32px; background: rgba(243,241,236,.96); border-bottom: 1px solid var(--line); }
      .brand { font-weight: 900; letter-spacing: .08em; font-size: 13px; line-height: 1.15; text-transform: uppercase; }
      nav { display: flex; gap: 18px; font-size: 13px; font-weight: 800; }
      main { max-width: 1180px; margin: 0 auto; padding: 78px 42px 96px; }
      .eyebrow { color: var(--gold); font-size: 12px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; margin-bottom: 20px; }
      h1 { max-width: 860px; margin: 0; font-size: clamp(42px, 7vw, 86px); line-height: .96; letter-spacing: 0; }
      .intro { max-width: 720px; margin-top: 28px; color: var(--muted); font-size: 20px; line-height: 1.65; }
      .body { max-width: 760px; margin-top: 44px; color: #354051; font-size: 17px; line-height: 1.8; white-space: pre-line; }
      .meta { margin-top: 42px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
      .gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 46px; }
      .gallery img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 6px; border: 1px solid var(--line); background: #fff; }
      footer { background: #e6bd43; padding: 38px 42px; font-size: 14px; }
      @media (max-width: 760px) {
        header { padding: 16px 20px; }
        nav { display: none; }
        main { padding: 46px 24px 70px; }
        .gallery { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <header>
      <div class="brand">Fiskum Plate &<br />Sveiseverksted AS</div>
      <nav><span>Om oss</span><span>Tjenester</span><span>Referanser</span><span>Aktuelt</span></nav>
    </header>
    <main>
      <div class="eyebrow">Live preview fra Sanity draft</div>
      <h1>${escapeHtml(title)}</h1>
      ${intro ? `<div class="intro">${escapeHtml(intro)}</div>` : ""}
      ${body ? `<div class="body">${escapeHtml(body)}</div>` : ""}
      ${images.length ? `<div class="gallery">${images.map((src) => `<img src="${src}" alt="" />`).join("")}</div>` : ""}
      <div class="meta">Publisert URL: ${escapeHtml(route)}</div>
    </main>
    <footer>Pålitelig, erfaren og profesjonell partner innen stål og metallarbeid.</footer>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const shellStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(420px, 48%) minmax(420px, 52%)",
  height: "100%",
  minHeight: 0,
};

const formStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  overflow: "auto",
  borderRight: "1px solid var(--card-border-color)",
};

const previewStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  background: "#f3f1ec",
};

const iframeStyle: CSSProperties = {
  flex: 1,
  width: "100%",
  minHeight: 0,
  border: 0,
  background: "#f3f1ec",
};

export function LivePreviewLayout(props: DocumentLayoutProps) {
  const state = useEditState(props.documentId, props.documentType);
  const document = state.draft ?? state.published;
  const html = useMemo(
    () => renderPreviewHtml(document, props.documentType),
    [document, props.documentType],
  );

  if (!previewTypes.has(props.documentType)) {
    return props.renderDefault(props);
  }

  return (
    <div style={shellStyle}>
      <div style={formStyle}>{props.renderDefault(props)}</div>
      <div style={previewStyle}>
        <Card padding={3} borderBottom tone="transparent">
          <Flex align="center" justify="space-between" gap={3}>
            <Stack space={2}>
              <Text size={1} weight="semibold">
                Live preview
              </Text>
              <Text size={1} muted>
                Oppdateres fra draft mens du skriver.
              </Text>
            </Stack>
            <Text size={1} muted>
              {state.ready ? "Klar" : "Laster"}
            </Text>
          </Flex>
        </Card>
        <Box flex={1} style={{ minHeight: 0 }}>
          <iframe title="Live preview" srcDoc={html} style={iframeStyle} />
        </Box>
      </div>
    </div>
  );
}
