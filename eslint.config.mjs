import { readdirSync } from "node:fs";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Layers, top to bottom: app -> features -> entities -> shared. A layer imports only layers below it.
// Slices in the same layer never import each other. Entities are imported through their public API:
// `@/entities/<name>` (client-safe), `@/entities/<name>/server` (server-only) or its db schema.
const slices = (layer) =>
  readdirSync(new URL(`./src/${layer}`, import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

const ENTITY_DEEP = ["@/entities/*/*", "@/entities/*/*/**", "!@/entities/*/server", "!@/entities/*/db", "@/entities/*/db/*", "!@/entities/*/db/schema"];

const restrict = (...patterns) => ({
  "no-restricted-imports": ["error", { patterns: patterns.map(([group, message]) => ({ group, message })) }],
});

const boundaries = [
  {
    files: ["src/shared/**"],
    rules: restrict([["@/entities/*", "@/entities/*/**", "@/features/*", "@/features/*/**", "@/app/*"], "shared sits at the bottom: no entities, features or routes."]),
  },
  ...slices("entities").map((entity) => ({
    files: [`src/entities/${entity}/**`],
    rules: restrict([
      ["@/entities/*", "@/entities/*/**", `!@/entities/${entity}`, `!@/entities/${entity}/**`, "@/features/*", "@/features/*/**", "@/app/*"],
      "An entity imports only itself and shared.",
    ]),
  })),
  ...slices("features").map((feature) => ({
    files: [`src/features/${feature}/**`],
    rules: restrict(
      [["@/features/*", "@/features/*/**", `!@/features/${feature}`, `!@/features/${feature}/**`, "@/app/*"], "A feature imports only itself, entities and shared; compose features in src/app."],
      [ENTITY_DEEP, "Import entities through their public API (index, server, db/schema)."],
    ),
  })),
  {
    files: ["src/app/**"],
    rules: restrict([ENTITY_DEEP, "Import entities through their public API (index, server, db/schema)."]),
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...boundaries,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "contracts/**",
  ]),
]);

export default eslintConfig;
