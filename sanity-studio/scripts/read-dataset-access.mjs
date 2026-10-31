import { getCliClient } from "sanity/cli";
const client = getCliClient({ apiVersion: "2025-06-01" });
const datasets = await client.datasets.list();
console.log(
  JSON.stringify(datasets.map(({ name, aclMode }) => ({ name, aclMode }))),
);
