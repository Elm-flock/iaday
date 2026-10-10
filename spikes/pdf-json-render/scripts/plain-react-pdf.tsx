// Fallback proof: plain @react-pdf/renderer (no json-render), same engine json-render wraps.
import fs from "node:fs";
import React from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { defineCatalog } from "@json-render/core";
import { schema, defineRegistry } from "@json-render/react-pdf";
import { standardComponentDefinitions } from "@json-render/react-pdf/catalog";
import { z } from "zod";

const buf = await renderToBuffer(
  <Document><Page size="A4"><Text>Reporte de equipo - ñ á é</Text></Page></Document>,
);
fs.writeFileSync("out/plain.pdf", buf);
console.log("plain react-pdf:", buf.subarray(0, 5).toString(), buf.length);

// Typed catalog + defineRegistry path (documented API) type-checks and runs
const catalog = defineCatalog(schema, {
  components: { ...standardComponentDefinitions, Badge: { props: z.object({ label: z.string() }), slots: [], description: "badge" } },
  actions: {},
});
const { registry } = defineRegistry(catalog, { components: { Badge: ({ element }) => <Text>{element.props.label}</Text> } });
console.log("defineRegistry keys:", Object.keys(registry));
