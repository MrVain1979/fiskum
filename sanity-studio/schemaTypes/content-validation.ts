import type { ValidationContext } from "sanity";
import { contentPath, slugError } from "../../lib/content-path.ts";
export async function validateRouteSlug(
  value: { current?: string } | undefined,
  context: ValidationContext,
) {
  const type = context.document?._type || "page";
  const error = slugError(value?.current, type);
  if (error) return error;
  if(type==='newsPost'&&(!context.document?.publishedAt||!Number.isFinite(new Date(String(context.document.publishedAt)).getTime())))return 'Velg en gyldig publiseringsdato først.';
  const id = context.document?._id?.replace(/^drafts\./, "");
  const path = contentPath({
    ...context.document,
    _type: type,
    slug: value?.current,
    publishedAt: context.document?.publishedAt as string | undefined,
  });
  const documents = await context
    .getClient({ apiVersion: "2025-06-01" })
    .withConfig({ perspective: "raw", useCdn: false })
    .fetch<
      Array<{
        _id: string;
        _type: string;
        slug?: { current?: string };
        publishedAt?: string;
        previousPaths?: string[];
      }>
    >(
      '*[_type in ["homePage","page","service","projectReference","newsPost"] && !(_id in path("versions.**"))]{_id,_type,slug,publishedAt,previousPaths}',
    );
  return documents.some(
    (d) =>
      d._id.replace(/^drafts\./, "") !== id &&
      (contentPath(d) === path || d.previousPaths?.includes(path || "")),
  )
    ? "URL-en er i bruk eller er en historisk URL for et annet dokument."
    : true;
}
export async function validateParent(
  value: { _ref?: string } | undefined,
  context: ValidationContext,
) {
  const id = context.document?._id?.replace(/^drafts\./, "");
  if (!id) return true;
  const documents = await context
    .getClient({ apiVersion: "2025-06-01" })
    .withConfig({ perspective: "raw", useCdn: false })
    .fetch<Array<{ _id: string; parent?: { _ref?: string } }>>(
      '*[_type=="page" && !(_id in path("versions.**"))]{_id,parent}',
    );
  const map = new Map<string, string | undefined>();
  for (const d of documents.filter((d) => !d._id.startsWith("drafts.")))
    map.set(d._id, d.parent?._ref);
  for (const d of documents.filter((d) => d._id.startsWith("drafts.")))
    map.set(d._id.slice(7), d.parent?._ref);
  if (
    value?._ref &&
    (!documents.some((d) => d._id === value._ref) ||
      value._ref.startsWith("drafts."))
  )
    return "Publiser og velg den overordnede siden først.";
  map.set(id, value?._ref);
  for (const start of map.keys()) {
    const visited = new Set<string>();
    let cursor: string | undefined = start;
    while (cursor) {
      if (visited.has(cursor))
        return "Hierarkiet kan ikke inneholde en sirkel.";
      visited.add(cursor);
      if (visited.size > 3)
        return "Flyttingen gir mer enn tre nivåer, inkludert underordnede sider.";
      cursor = map.get(cursor);
    }
  }
  return true;
}
