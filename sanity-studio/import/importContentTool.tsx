import { Box, Button, Card, Code, Heading, Stack, Text } from "@sanity/ui";
import { UploadIcon } from "@sanity/icons";
import { useMemo, useState } from "react";
import { useClient } from "sanity";

import { fiskumSeedDocuments } from "./fiskumSeed";

type ImportState = "idle" | "running" | "done" | "error";

const apiVersion = "2025-06-01";
const importOrder: Record<string, number> = {
  settings: 0,
  page: 1,
  service: 1,
  projectReference: 2,
  newsPost: 2,
  faq: 2,
  footer: 3,
  navbar: 3,
  homePage: 4,
};

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function uploadAsset(client: ReturnType<typeof useClient>, assetPath: string, cache: Map<string, string>) {
  const cached = cache.get(assetPath);
  if (cached) return cached;

  const response = await fetch(assetPath);
  if (!response.ok) throw new Error(`Kunne ikke hente bilde: ${assetPath}`);

  const blob = await response.blob();
  const filename = assetPath.split("/").filter(Boolean).at(-1) || "fiskum-image";
  const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
  const asset = await client.assets.upload("image", file, { filename });
  cache.set(assetPath, asset._id);
  return asset._id;
}

async function prepareValue(client: ReturnType<typeof useClient>, value: any, cache: Map<string, string>): Promise<any> {
  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => prepareValue(client, item, cache)));
  }

  if (!isObject(value)) return value;

  if (typeof value.assetPath === "string") {
    const assetRef = await uploadAsset(client, value.assetPath, cache);
    const { assetPath, ...rest } = value;
    return {
      ...rest,
      _type: rest._type || "image",
      asset: { _type: "reference", _ref: assetRef },
    };
  }

  const prepared: Record<string, any> = {};
  for (const [key, childValue] of Object.entries(value)) {
    prepared[key] = await prepareValue(client, childValue, cache);
  }
  return prepared;
}

function ImportContentTool() {
  const client = useClient({ apiVersion });
  const [state, setState] = useState<ImportState>("idle");
  const [log, setLog] = useState<string[]>([]);
  const documents = useMemo(
    () =>
      [...fiskumSeedDocuments].sort(
        (a, b) => (importOrder[a._type] ?? 50) - (importOrder[b._type] ?? 50)
      ),
    []
  );

  const append = (message: string) => setLog((current) => [...current, message]);

  const runImport = async () => {
    setState("running");
    setLog([]);

    try {
      const assetCache = new Map<string, string>();
      append(`Starter import av ${documents.length} dokumenter.`);

      for (const document of documents) {
        const preparedDocument = await prepareValue(client, document, assetCache);
        await client.createOrReplace(preparedDocument);
        append(`Importert: ${preparedDocument._id}`);
      }

      append(`Ferdig. Lastet opp/gjenbrukte ${assetCache.size} bilde-assets.`);
      setState("done");
    } catch (error) {
      append(error instanceof Error ? error.message : "Ukjent importfeil.");
      setState("error");
    }
  };

  return (
    <Box padding={4}>
      <Card padding={5} radius={3} shadow={1} tone={state === "error" ? "critical" : "default"} style={{ maxWidth: 760 }}>
        <Stack space={4}>
          <Heading as="h1" size={3}>
            Importer Fiskum-innhold
          </Heading>
          <Text size={2}>
            Fyller Sanity med alt lanseringsinnhold fra gammel/statisk side: sider, tjenester, referanser, nyheter, FAQ, meny, footer og bilder.
          </Text>
          <Text size={1} muted>
            Knappen overskriver dokumentene med faste ID-er. Bruk den ved første import eller når du bevisst vil nullstille innholdet tilbake til lanseringssettet.
          </Text>
          <Button
            icon={UploadIcon}
            text={state === "running" ? "Importerer..." : "Importer innhold"}
            tone="primary"
            disabled={state === "running"}
            onClick={runImport}
          />
          {log.length > 0 ? (
            <Card padding={3} radius={2} tone={state === "error" ? "critical" : "transparent"}>
              <Code size={1}>{log.join("\n")}</Code>
            </Card>
          ) : null}
        </Stack>
      </Card>
    </Box>
  );
}

export const importContentTool = {
  name: "import-fiskum-content",
  title: "Importer innhold",
  icon: UploadIcon,
  component: ImportContentTool,
};
