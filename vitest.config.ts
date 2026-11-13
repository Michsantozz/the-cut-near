import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const serverOnlyStub = fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url));

// One project per test kind, all sharing tests/setup.ts.
const project = (name: string) => ({
  extends: true as const,
  test: {
    name,
    include: [`tests/${name}/**/*.test.{ts,tsx}`],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
  },
});

export default defineConfig({
  resolve: { tsconfigPaths: true, alias: { "server-only": serverOnlyStub } },
  test: {
    passWithNoTests: true,
    projects: [project("unit"), project("integration"), project("smoke"), project("e2e"), project("evals")],
  },
});
