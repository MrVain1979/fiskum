export type SanityImageData = {
  _type?: string | null;
  _key?: string | null;
  alt?: string | null;
  asset?: {
    _id?: string;
    _ref?: string;
    url?: string | null;
    mimeType?: string | null;
    metadata?: {
      dimensions?: { width?: number | null; height?: number | null } | null;
    } | null;
  } | null;
  crop?: { left?: number | null; top?: number | null; right?: number | null; bottom?: number | null } | null;
  hotspot?: { x?: number | null; y?: number | null; width?: number | null; height?: number | null } | null;
};

export type ResolvedImage = {
  src: string;
  width?: number;
  height?: number;
  objectPosition?: string;
};

const fraction = (value: number | null | undefined, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;

const positiveDimension = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.round(value))
    : undefined;

/** Keep unedited image URLs unchanged; apply Studio crop and focal point when present. */
export function resolveSanityImage(
  image: SanityImageData | string | null | undefined,
): ResolvedImage | null {
  if (!image) return null;
  if (typeof image === "string") return { src: image };
  const src = image.asset?.url;
  if (!src) return null;

  const dimensions = image.asset?.metadata?.dimensions;
  const fromId = (image.asset?._id ?? image.asset?._ref ?? "").match(
    /-(\d+)x(\d+)-[a-z\d]+$/i,
  );
  const fromUrl = src.match(/-(\d+)x(\d+)\.[a-z\d]+(?:[/?#]|$)/i);
  const encoded = fromId ?? fromUrl;
  const width =
    positiveDimension(dimensions?.width) ??
    (encoded ? Number(encoded[1]) : undefined);
  const height =
    positiveDimension(dimensions?.height) ??
    (encoded ? Number(encoded[2]) : undefined);
  const result: ResolvedImage = { src, width, height };

  let left = 0;
  let top = 0;
  let visibleWidth = 1;
  let visibleHeight = 1;
  // Sanity transforms raster formats only. In particular, do not send SVG icons through rect.
  if (
    width &&
    height &&
    /\.(?:jpe?g|pjpg|png|webp|tiff?|avif|gif)(?:[/?#]|$)/i.test(src)
  ) {
    const cropLeft = Math.min(
      width - 1,
      Math.round(fraction(image.crop?.left) * width),
    );
    const cropTop = Math.min(
      height - 1,
      Math.round(fraction(image.crop?.top) * height),
    );
    const cropRight = Math.min(
      width - cropLeft - 1,
      Math.round(fraction(image.crop?.right) * width),
    );
    const cropBottom = Math.min(
      height - cropTop - 1,
      Math.round(fraction(image.crop?.bottom) * height),
    );
    const cropWidth = width - cropLeft - cropRight;
    const cropHeight = height - cropTop - cropBottom;
    if (cropLeft || cropTop || cropRight || cropBottom) {
      const url = new URL(src);
      url.searchParams.set(
        "rect",
        `${cropLeft},${cropTop},${cropWidth},${cropHeight}`,
      );
      result.src = url.href;
      result.width = cropWidth;
      result.height = cropHeight;
    }
    left = cropLeft / width;
    top = cropTop / height;
    visibleWidth = cropWidth / width;
    visibleHeight = cropHeight / height;
  }
  if (image.hotspot) {
    const x = fraction(
      (fraction(image.hotspot.x, 0.5) - left) / visibleWidth,
      0.5,
    );
    const y = fraction(
      (fraction(image.hotspot.y, 0.5) - top) / visibleHeight,
      0.5,
    );
    result.objectPosition = `${Number((x * 100).toFixed(4))}% ${Number((y * 100).toFixed(4))}%`;
  }
  return result;
}
