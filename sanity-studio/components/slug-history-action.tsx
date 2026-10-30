import { contentPath } from "../../lib/content-path.ts";
import { useState } from "react";
import { useClient, type DocumentActionComponent } from "sanity";

// Wrap once when config loads, preserving native validation, disabled state, editor focus and publish operation.
export function withSlugHistory(
  NativePublish: DocumentActionComponent,
): DocumentActionComponent {
  const PublishWithHistory: DocumentActionComponent = (props) => {
    const native = NativePublish(props);
    const client = useClient({ apiVersion: "2025-06-01" }).withConfig({
      perspective: "raw",
      useCdn: false,
    });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    if (!native) return null;
    return {
      ...native,
      disabled: native.disabled || busy,
      label: busy ? "Lagrer URL-historikk …" : native.label,
      dialog: error
        ? {
            type: "custom",
            onClose: () => setError(undefined),
            component: (
              <div role="alert" style={{ padding: 24 }}>
                <p>{error}</p>
                <button type="button" onClick={() => setError(undefined)}>
                  Lukk og prøv igjen
                </button>
              </div>
            ),
          }
        : native.dialog,
      onHandle: async () => {
        setBusy(true);
        setError(undefined);
        try {
          const id = props.id.replace(/^drafts\./, "");
          const pair = await client.fetch<
            Array<{
              _id: string;
              _rev: string;
              slug?: { current?: string };
              publishedAt?: string;
              _type: string;
              previousPaths?: string[];
            }>
          >(
            '*[_id in [$id,"drafts."+$id]]{_id,_type,_rev,slug,publishedAt,previousPaths}',
            {
              id,
            },
          );
          const published = pair.find((d) => d._id === id);
          const draft = pair.find((d) => d._id === `drafts.${id}`);
          const oldSlug = published ? contentPath(published) : null;
          const nextSlug = draft ? contentPath(draft) : null;
          if (draft && oldSlug && nextSlug && oldSlug !== nextSlug) {
            const previousPaths = [
              ...new Set([
                ...(published?.previousPaths ?? []),
                ...(draft.previousPaths ?? []),
                oldSlug,
              ]),
            ].filter((s) => s !== nextSlug);
            await client
              .patch(draft._id)
              .ifRevisionId(draft._rev)
              .set({ previousPaths })
              .commit();
          }
          native.onHandle?.();
        } catch {
          setError(
            "URL-historikken kunne ikke lagres. Siden er ikke publisert. Vent til lagringen er ferdig og prøv igjen.",
          );
        } finally {
          setBusy(false);
        }
      },
    };
  };
  PublishWithHistory.action = "publish";
  return PublishWithHistory;
}
