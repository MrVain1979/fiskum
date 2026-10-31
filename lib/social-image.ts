import type { SanityImageData } from "./image.ts";
import { resolveSanityImage } from "./image.ts";
import { stegaClean } from "@sanity/client/stega";

const formats: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  tif: "image/tiff",
  tiff: "image/tiff",
};
export const socialImageAccept = [...new Set(Object.values(formats))].join(",");
export function socialImage(image: SanityImageData | null | undefined) {
  if (!image?.asset || !image.alt || !stegaClean(image.alt).trim()) return null;
  const id = image.asset._id ?? image.asset._ref ?? "";
  const identity = /^image-[a-f\d]+-(\d+)x(\d+)-([a-z\d]+)$/i.exec(id);
  if (!identity || !formats[identity[3].toLowerCase()]) return null;
  if (
    image.asset.mimeType &&
    formats[identity[3].toLowerCase()] !== image.asset.mimeType
  )
    return null;
  const dimensions = image.asset.metadata?.dimensions;
  const width = dimensions?.width ?? Number(identity[1]);
  const height = dimensions?.height ?? Number(identity[2]);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width !== Number(identity[1]) ||
    height !== Number(identity[2])
  )
    return null;
  if (image.crop) {
    const values = [
      image.crop.left,
      image.crop.top,
      image.crop.right,
      image.crop.bottom,
    ];
    if (
      values.some(
        (n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n >= 1,
      )
    )
      return null;
    if (
      image.crop.left! + image.crop.right! >= 1 ||
      image.crop.top! + image.crop.bottom! >= 1
    )
      return null;
  }
  if (image.hotspot) {
    const { x, y, width: w, height: h } = image.hotspot;
    if (
      [x, y, w, h].some((n) => typeof n !== "number" || !Number.isFinite(n)) ||
      x! < 0 ||
      x! > 1 ||
      y! < 0 ||
      y! > 1 ||
      w! <= 0 ||
      w! > 1 ||
      h! <= 0 ||
      h! > 1 ||
      x! - w! / 2 < -1e-8 ||
      x! + w! / 2 > 1 + 1e-8 ||
      y! - h! / 2 < -1e-8 ||
      y! + h! / 2 > 1 + 1e-8
    )
      return null;
  }
  const remainingWidth =
    width * (1 - (image.crop?.left ?? 0) - (image.crop?.right ?? 0));
  const remainingHeight =
    height * (1 - (image.crop?.top ?? 0) - (image.crop?.bottom ?? 0));
  if (remainingWidth < 1200 || remainingHeight < 630) return null;
  const resolved = resolveSanityImage({
    ...image,
    asset: {
      ...image.asset,
      url:
        image.asset.url ??
        `https://cdn.sanity.io/images/qgyys6fw/production/${id.slice(6).replace(/-([a-z\d]+)$/i, ".$1")}`,
    },
  });
  if (!resolved) return null;
  const url = new URL(resolved.src);
  if (
    url.origin !== "https://cdn.sanity.io" ||
    !url.pathname.startsWith("/images/qgyys6fw/production/")
  )
    return null;
  url.searchParams.set("w", "1200");
  url.searchParams.set("h", "630");
  url.searchParams.set("fit", "crop");
  url.searchParams.set("fm", "jpg");
  if (image.hotspot) {
    url.searchParams.set("crop", "focalpoint");
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    url.searchParams.set(
      "fp-x",
      String(
        clamp(
          (image.hotspot.x! - (image.crop?.left ?? 0)) /
            (remainingWidth / width),
        ),
      ),
    );
    url.searchParams.set(
      "fp-y",
      String(
        clamp(
          (image.hotspot.y! - (image.crop?.top ?? 0)) /
            (remainingHeight / height),
        ),
      ),
    );
  }
  return {
    url: url.href,
    width: 1200,
    height: 630,
    alt: stegaClean(image.alt).trim(),
  };
}
