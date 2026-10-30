import { readFile, writeFile } from "node:fs/promises";
import { buildMigration } from "./full-313-model.mjs";
const args = process.argv.slice(2);
const arg = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const source = arg("--source");
if (!source)
  throw new Error(
    "Provide --source with the fresh authenticated raw business/asset snapshot made by sanity-studio/scripts/read-full-313.mjs.",
  );
const snapshot = JSON.parse(await readFile(source, "utf8"));
const plan = buildMigration(snapshot);
const output =
  arg("--output") ||
  new URL(
    "../../../outputs/fiskum-full-313-migration-plan.local.json",
    import.meta.url,
  );
await writeFile(output, JSON.stringify(plan, null, 2) + "\n");
if (arg("--after-documents"))
  await writeFile(
    arg("--after-documents"),
    plan.documents.map((doc) => JSON.stringify(doc.after)).join("\n") + "\n",
  );
console.log(
  `DRY RUN: prepared ${plan.mutations.length} additive revision-guarded patches, including ${plan.documents.filter((d) => d.id.startsWith("drafts.")).length} independently preserved drafts. No writes. Review ${output}.`,
);
if (args.includes("--write"))
  throw new Error(
    "Root owns CMS writes. Apply the exact reviewed plan.mutations using authenticated getCliClient after verifying the complete backup and every current revision. This script intentionally has no write mode.",
  );
