import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { http } from "@payrail/api";

const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../docs/openapi.json",
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, http.getOpenApiJson(true));
console.log(`wrote ${out}`);
const doc = JSON.parse(http.getOpenApiJson(false));
const paths = Object.keys(doc.paths ?? {});
console.log(`paths: ${paths.join(", ")}`);
console.log(`components: ${Object.keys(doc.components?.schemas ?? {}).join(", ")}`);