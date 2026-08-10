import { Button, Card, Stack, Text } from "@sanity/ui";
import { useState } from "react";
import {
  type ArrayOfObjectsInputProps,
  PatchEvent,
  set,
  useClient,
  useFormValue,
} from "sanity";

type WorkshopGalleryItem = {
  _key: string;
  _type: "imageWithAlt";
  alt: string;
  asset: {
    _ref: string;
    _type: "reference";
  };
};

const workshopImages = [
  {
    file: "workshop-20260226-180532.jpg",
    alt: "Stor båndsag for kapping av stålprofiler i verkstedet",
  },
  {
    file: "workshop-20260226-181110.jpg",
    alt: "CNC-styrt plasmaskjærer i verkstedet",
  },
  {
    file: "workshop-20260226-181204.jpg",
    alt: "Kantpresse for bøying av stålplater",
  },
  {
    file: "workshop-20260226-180646.jpg",
    alt: "Plateknekke for bearbeiding av metallplater",
  },
  {
    file: "workshop-20260226-180740-edited.jpg",
    alt: "Platevalse for forming av stålplater",
  },
  {
    file: "workshop-20260226-180724.jpg",
    alt: "Kombinert stanse- og klippemaskin i verkstedet",
  },
  {
    file: "workshop-20260226-180548.jpg",
    alt: "Automatisk båndsag for kapping av stålprofiler",
  },
  {
    file: "workshop-20260226-181347-1.jpg",
    alt: "Dreiebenk for maskinering av metalldeler",
  },
  {
    file: "workshop-20260226-181406.jpg",
    alt: "Fresemaskin for maskinering av metalldeler",
  },
] as const;

export function WorkshopGalleryInput(props: ArrayOfObjectsInputProps) {
  const client = useClient({ apiVersion: "2025-02-10" });
  const slug = useFormValue(["slug", "current"]);
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const galleryValue = props.value as WorkshopGalleryItem[] | undefined;
  const hasImages =
    Array.isArray(galleryValue) &&
    galleryValue.some((item) => Boolean(item?.asset?._ref));
  const isWorkshop = slug === "/verksted" || slug === "verksted";

  async function importWorkshopImages() {
    setStatus("uploading");
    setError("");

    try {
      const images: WorkshopGalleryItem[] = [];

      for (const image of workshopImages) {
        const response = await fetch(`/assets/${image.file}`);

        if (!response.ok) {
          throw new Error(`Kunne ikke hente ${image.file}`);
        }

        const asset = await client.assets.upload(
          "image",
          await response.blob(),
          {
            filename: image.file,
          },
        );

        images.push({
          _key: crypto.randomUUID().replaceAll("-", ""),
          _type: "imageWithAlt",
          alt: image.alt,
          asset: {
            _ref: asset._id,
            _type: "reference",
          },
        });
      }

      props.onChange(PatchEvent.from(set(images)));
      setStatus("done");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Importen kunne ikke fullføres.",
      );
      setStatus("error");
    }
  }

  return (
    <Stack space={3}>
      {props.renderDefault(props)}
      {isWorkshop && !hasImages && (
        <Card
          padding={3}
          radius={2}
          tone={status === "error" ? "critical" : "primary"}
        >
          <Stack space={3}>
            <Text size={1}>
              Legg inn de ni originale verkstedbildene i riktig rekkefølge.
            </Text>
            <Button
              disabled={status === "uploading"}
              loading={status === "uploading"}
              onClick={importWorkshopImages}
              text={
                status === "done"
                  ? "Bildene er lagt inn"
                  : "Legg inn verkstedbildene"
              }
              tone="primary"
            />
            {error && <Text size={1}>{error}</Text>}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
