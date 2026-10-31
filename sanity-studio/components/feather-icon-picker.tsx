import { Box, Card, Select, Stack, Text } from "@sanity/ui";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Feather from "react-icons/fi";
import { establishedServiceIcons } from "../../lib/established-icons.mjs";
import {
  defineField,
  defineType,
  PatchEvent,
  set,
  setIfMissing,
  type ObjectInputProps,
} from "sanity";
const names = Object.keys(Feather)
  .filter((name) => name.startsWith("Fi"))
  .sort();
type IconValue = { provider?: string; name?: string; svg?: string };
const icon = (name?: string) =>
  name && name in Feather ? Feather[name as keyof typeof Feather] : null;
export function preview(value: IconValue) {
  const Component = icon(value.name);
  // Only the four approved original SVG literals can use this legacy display path.
  const existing = Object.values(establishedServiceIcons).find(
    (svg) => svg === value.svg,
  );
  return Component
    ? createElement(Component)
    : existing
      ? createElement("span", {
          style: { display: "inline-block", width: 32, height: 32 },
          dangerouslySetInnerHTML: { __html: existing },
        })
      : createElement("span", null, "◇");
}
function FeatherPicker({
  value,
  onChange,
  readOnly,
  id,
}: ObjectInputProps<IconValue>) {
  const Component = icon(value?.name);
  return (
    <Stack gap={3}>
      <Select
        id={id}
        value={value?.name ?? ""}
        disabled={readOnly}
        onChange={(event) => {
          const name = event.currentTarget.value;
          const Selected = icon(name);
          if (!Selected) return;
          onChange(
            PatchEvent.from([
              setIfMissing({ _type: "iconPicker" }),
              set("fi", ["provider"]),
              set(name, ["name"]),
              set(renderToStaticMarkup(createElement(Selected)), ["svg"]),
            ]),
          );
        }}
      >
        <option value="">Velg ikon</option>
        {value?.name && !Component ? (
          <option value={value.name}>Eksisterende ikon</option>
        ) : null}
        {names.map((name) => (
          <option key={name} value={name}>
            {name.slice(2).replace(/([a-z])([A-Z])/g, "$1 $2")}
          </option>
        ))}
      </Select>
      <Card padding={3} border radius={2}>
        <Box>
          {Component ? (
            <Component size={32} />
          ) : value?.svg &&
            Object.values(establishedServiceIcons).includes(value.svg) ? (
            preview(value)
          ) : (
            <Text>Ikonet beholdes til du velger et annet.</Text>
          )}
        </Box>
      </Card>
    </Stack>
  );
}
// The old plugin only declares Sanity3 support. Preserve its data shape and complete Feather catalogue with native Sanity6 patches.
export const iconPickerType = defineType({
  name: "iconPicker",
  title: "Ikon",
  type: "object",
  components: { input: FeatherPicker },
  fields: [
    defineField({
      name: "provider",
      type: "string",
      hidden: true,
      readOnly: true,
    }),
    defineField({ name: "name", type: "string", hidden: true, readOnly: true }),
    defineField({ name: "svg", type: "text", hidden: true, readOnly: true }),
  ],
  preview: {
    select: { name: "name" },
    prepare: ({ name }) => ({ title: name || "Ikon" }),
  },
});
