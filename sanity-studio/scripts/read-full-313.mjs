import { writeFile } from "node:fs/promises";
import { getCliClient } from "sanity/cli";
const client = getCliClient({ apiVersion: "2025-06-01" }).withConfig({
  perspective: "raw",
  useCdn: false,
});
const types = [
  "homePage",
  "page",
  "service",
  "projectReference",
  "newsPost",
  "settings",
  "navbar",
  "footer",
  "faq",
  "redirect",
  "blog",
  "blogIndex",
  "author",
];
// Intentionally excludes all Inbox submissions, preview secrets and system documents.
const documents = await client.fetch(
  '*[_type in $types && !(_id in path("versions.**"))]{...}',
  { types },
);
const assets = await client.fetch(
  '*[_type in ["sanity.imageAsset","sanity.fileAsset"]]{_id,_type,_updatedAt,url,mimeType,originalFilename,metadata{dimensions}}',
);
const output = new URL(
  `../../../../outputs/fiskum-live-${process.env.FISKUM_SNAPSHOT_PHASE === "after" ? "after" : "before"}-full-313.local.json`,
  import.meta.url,
);
await writeFile(
  output,
  JSON.stringify(
    {
      queriedAt: new Date().toISOString(),
      project: "qgyys6fw",
      dataset: "production",
      documents,
      assets,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Read-only authenticated snapshot: ${documents.length} business documents (${documents.filter((d) => d._id.startsWith("drafts.")).length} drafts), ${assets.length} asset metadata records. Saved outside Git; no submissions/secrets read; no writes.`,
);
