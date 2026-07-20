import { Box, Card, Flex, Spinner, Stack, Text } from "@sanity/ui";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useEditState, type SanityDocument } from "sanity";
import type { DocumentLayoutProps } from "sanity";

const previewTypes = new Set([
  "homePage",
  "page",
  "service",
  "projectReference",
  "newsPost",
]);

const studioEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
const sanityProjectId = studioEnv.SANITY_STUDIO_PROJECT_ID;
const sanityDataset = studioEnv.SANITY_STUDIO_DATASET;

type PortableTextBlock = {
  _type?: string;
  style?: string;
  listItem?: string;
  children?: Array<{ text?: string; marks?: string[] }>;
  asset?: {
    _ref?: string;
    url?: string;
  };
  alt?: string;
  caption?: string;
};

type PdfFile = {
  title?: string;
  description?: string;
  file?: {
    asset?: {
      _ref?: string;
      url?: string;
    };
  };
};

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

function normalizeRoute(route: string) {
  if (route === "/") return "/";
  return `${route.replace(/\/+$/, "")}/`;
}

function getRoute(document: Partial<SanityDocument> | null, documentType: string) {
  const slug = getSlug(document);

  if (documentType === "homePage") return "/";
  if (documentType === "projectReference") {
    return normalizeRoute(`/referanser${slug}`);
  }

  if (documentType === "newsPost") {
    const publishedAt = getString(document, ["publishedAt"]);
    if (publishedAt) {
      const date = new Date(publishedAt);
      if (!Number.isNaN(date.getTime())) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        return normalizeRoute(`/${yyyy}/${mm}/${dd}${slug}`);
      }
    }
  }

  return normalizeRoute(slug);
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

function fileUrlFromRef(ref?: string) {
  if (!sanityProjectId || !sanityDataset) return "";
  if (!ref?.startsWith("file-")) return "";
  const withoutPrefix = ref.slice("file-".length);
  const lastDash = withoutPrefix.lastIndexOf("-");
  if (lastDash === -1) return "";
  const id = withoutPrefix.slice(0, lastDash);
  const extension = withoutPrefix.slice(lastDash + 1);
  return `https://cdn.sanity.io/files/${sanityProjectId}/${sanityDataset}/${id}.${extension}`;
}

function imageUrlFromRef(ref?: string) {
  if (!sanityProjectId || !sanityDataset) return "";
  if (!ref?.startsWith("image-")) return "";
  const withoutPrefix = ref.slice("image-".length);
  const lastDash = withoutPrefix.lastIndexOf("-");
  if (lastDash === -1) return "";
  const id = withoutPrefix.slice(0, lastDash);
  const extension = withoutPrefix.slice(lastDash + 1);
  return `https://cdn.sanity.io/images/${sanityProjectId}/${sanityDataset}/${id}.${extension}`;
}

function getPdfFiles(document: Partial<SanityDocument> | null) {
  const pdfFiles = getValue(document, "pdfFiles");
  if (!Array.isArray(pdfFiles)) return [];

  return pdfFiles
    .map((file: PdfFile) => ({
      title: file.title || "Last ned PDF",
      description: file.description || "",
      url: file.file?.asset?.url || fileUrlFromRef(file.file?.asset?._ref),
    }))
    .filter((file) => file.url);
}

function plainText(document: Partial<SanityDocument> | null) {
  return (
    getString(document, ["summary", "excerpt", "description"]) ||
    textFromPortableText(getValue(document, "body"))
  );
}

function renderPortableText(value: unknown) {
  if (!Array.isArray(value)) return "";

  return value
    .map((block: PortableTextBlock) => {
      if (block?._type === "image" || block?._type === "imageWithAlt") {
        const src = block.asset?.url || imageUrlFromRef(block.asset?._ref);
        if (!src) return "";
        const alt = block.alt || block.caption || "";
        const caption = block.caption ? `<figcaption>${escapeHtml(block.caption)}</figcaption>` : "";
        return `<figure><img src="${src}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">${caption}</figure>`;
      }

      if (block?._type !== "block") return "";
      const text = (block.children || [])
        .map((child) => {
          let value = escapeHtml(child.text || "");
          const marks = child.marks || [];
          if (marks.includes("strong")) value = `<strong>${value}</strong>`;
          if (marks.includes("em")) value = `<em>${value}</em>`;
          return value;
        })
        .join("");

      if (!text) return "";
      if (block.listItem) return `<li>${text}</li>`;
      if (["h2", "h3", "h4"].includes(block.style || "")) return `<${block.style}>${text}</${block.style}>`;
      return `<p>${text}</p>`;
    })
    .join("");
}

function renderDraftGallery(document: Partial<SanityDocument> | null) {
  const gallery = getValue(document, "gallery");
  if (!Array.isArray(gallery)) return "";

  const images = gallery
    .map((image: PortableTextBlock) => ({
      alt: image.alt || image.caption || "",
      url: image.asset?.url || imageUrlFromRef(image.asset?._ref),
    }))
    .filter((image) => image.url);

  if (!images.length) return "";

  return `<div class="gallery">${images
    .map((image) => `<img src="${image.url}" alt="${escapeHtml(image.alt)}" loading="lazy" decoding="async">`)
    .join("")}</div>`;
}

function applyDraftToPageHtml(
  html: string,
  route: string,
  document: Partial<SanityDocument> | null,
  documentType: string,
) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const title = getString(document, ["title", "internalTitle"]);
  const intro = plainText(document);
  const pdfFiles = getPdfFiles(document);
  const base = doc.createElement("base");

  base.href = window.location.origin;
  doc.head.prepend(base);

  doc.documentElement.dataset.sanityLivePreview = "true";

  doc.querySelectorAll("script").forEach((script) => script.remove());

  const titleEl = doc.querySelector("title");
  if (titleEl && title) titleEl.textContent = title;

  const h1 = doc.querySelector("h1");
  if (h1 && title) h1.textContent = title;

  const currentCrumb = doc.querySelector('[aria-current="page"]');
  if (currentCrumb && title) currentCrumb.textContent = title;

  const descriptionMeta = doc.querySelector('meta[name="description"]');
  if (descriptionMeta && intro) descriptionMeta.setAttribute("content", intro);

  const lead =
    doc.querySelector(".page-hero p") ||
    doc.querySelector(".article-hero p") ||
    doc.querySelector("main p");

  if (lead && intro) lead.textContent = intro;

  const contentStack = doc.querySelector(".content-stack");
  const draftBody = [
    renderPortableText(getValue(document, "body")),
    renderPortableText(getValue(document, "richText")),
    renderDraftGallery(document),
  ].join("");

  if (contentStack && draftBody.trim()) {
    contentStack.innerHTML = draftBody;
  }

  const notice = doc.createElement("div");
  notice.textContent = `Live preview fra Sanity draft - ${route}`;
  notice.setAttribute(
    "style",
    [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:99999",
      "background:#111",
      "color:#fff",
      "font:700 12px/1.2 Arial,sans-serif",
      "letter-spacing:.02em",
      "padding:10px 12px",
      "border-radius:999px",
      "box-shadow:0 10px 28px rgba(0,0,0,.22)",
    ].join(";"),
  );
  doc.body.append(notice);

  if (documentType === "homePage") {
    const homeTitle = getString(document, ["title"]);
    const heroTitle = doc.querySelector(".hero h1, h1");
    if (heroTitle && homeTitle) heroTitle.textContent = homeTitle;
  }

  if (pdfFiles.length) {
    const target =
      doc.querySelector(".content-stack") ||
      doc.querySelector(".page-content") ||
      doc.querySelector("main");

    if (target) {
      const section = doc.createElement("section");
      section.className = "pdf-downloads is-visible";
      section.setAttribute("aria-label", "PDF-dokumenter");
      section.innerHTML = `<h2>Dokumenter</h2><div class="pdf-download-list">${pdfFiles
        .map(
          (file) =>
            `<a class="pdf-download" href="${file.url}" target="_blank" rel="noopener"><strong>${escapeHtml(
              file.title,
            )}</strong>${
              file.description ? `<span>${escapeHtml(file.description)}</span>` : ""
            }</a>`,
        )
        .join("")}</div>`;
      target.append(section);
    }
  }

  return `<!doctype html>${doc.documentElement.outerHTML}`;
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
  const route = useMemo(
    () => getRoute(document, props.documentType),
    [document, props.documentType],
  );
  const [html, setHtml] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!previewTypes.has(props.documentType)) return;

    const controller = new AbortController();
    setIsLoading(true);

    fetch(route, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Kunne ikke laste ${route}`);
        return response.text();
      })
      .then((pageHtml) => {
        setHtml(applyDraftToPageHtml(pageHtml, route, document, props.documentType));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setHtml(`<!doctype html>
<html lang="no">
  <body style="font-family:Arial,sans-serif;padding:32px;background:#f3f1ec;color:#111">
    <h1>Preview kunne ikke lastes</h1>
    <p>${String(error instanceof Error ? error.message : error)}</p>
  </body>
</html>`);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [document, props.documentType, route]);

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
                Viser faktisk nettside og oppdaterer draft-tekst mens du skriver.
              </Text>
            </Stack>
            <Flex align="center" gap={2}>
              {isLoading ? <Spinner muted /> : null}
              <Text size={1} muted>
                {state.ready ? route : "Laster"}
              </Text>
            </Flex>
          </Flex>
        </Card>
        <Box flex={1} style={{ minHeight: 0 }}>
          <iframe title="Live preview" srcDoc={html} style={iframeStyle} />
        </Box>
      </div>
    </div>
  );
}
