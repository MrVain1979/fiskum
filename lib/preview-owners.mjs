import { createDataAttribute } from "next-sanity";
import { stegaClean } from "@sanity/client/stega";
/** @template T @param {T} value @returns {T} Retain the actual query shape while adding preview-only ownership metadata. */
export function annotateOwners(value, owner = null, path = []) {
  if (Array.isArray(value))
    return value.map((item, index) =>
      annotateOwners(item, owner, [
        ...path,
        item?._key ? { _key: stegaClean(item._key) } : index,
      ]),
    );
  if (!value || typeof value !== "object") return value;
  if (value._id && value._type && !String(value._type).startsWith("sanity.")) {
    owner = {
      id: value._id,
      type: value._type,
      _imageSectionKey: value._imageSectionKey,
    };
    path = [];
  }
  const result = {};
  for (const [key, entry] of Object.entries(value))
    result[key] =
      key === "asset" ? entry : annotateOwners(entry, owner, [...path, key]);
  if (value._id && value._type && owner)
    result._editRoot = { id: owner.id, type: owner.type };
  if (
    owner &&
    (value._type === "iconPicker" ||
      value.asset?._id?.startsWith("image-") ||
      value.asset?._ref?.startsWith("image-"))
  ) {
    let fieldPath = path;
    if (path.length === 1 && path[0] === "image") {
      if (owner.type === "newsPost") fieldPath = ["mainImage"];
      else if (value._key && owner._imageSectionKey)
        fieldPath = [
          "sections",
          { _key: owner._imageSectionKey },
          "images",
          { _key: value._key },
        ];
    }
    result._editOwner = { id: owner.id, type: owner.type, path: fieldPath };
  }
  return result;
}
export function editAttribute(image) {
  if (!image?._editOwner) return "";
  const target = createDataAttribute({
    ...image._editOwner,
    projectId: "qgyys6fw",
    dataset: "production",
    baseUrl:
      process.env.NEXT_PUBLIC_SANITY_STUDIO_URL ||
      "https://www.fiskum-sveis.no/studio",
  }).toString();
  return ` data-sanity="${target.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`;
}
export function editFieldAttribute(document, path) {
  return document?._editRoot
    ? editAttribute({ _editOwner: { ...document._editRoot, path } })
    : "";
}
