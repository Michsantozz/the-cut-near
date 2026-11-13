import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import { SAMPLE_LINES } from "../model/sample";
import { memoryDirectorStore, type DirectorStore } from "./store";
import { drizzleDirectorStore } from "./store-drizzle";

// Where the Director keeps its lines. With DATA_SOURCE=live they go to Postgres; with "sample" (the
// default) they live in memory, so every screen works without a database.
// TODO(merge): use the platform's shared db client (`@/shared/db/client`) and global config instead of
// opening a connection and reading DATA_SOURCE / DATABASE_URL here.

const runtimeEnvSchema = z.object({
  DATA_SOURCE: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["sample", "live"]).default("sample")),
  DATABASE_URL: z.preprocess((v) => (v === "" ? undefined : v), z.url().optional()),
});

export type DirectorDataSource = "sample" | "live";

export function directorDataSource(env: Record<string, string | undefined> = process.env): DirectorDataSource {
  return runtimeEnvSchema.parse(env).DATA_SOURCE;
}

let store: DirectorStore | null = null;

/** The process-wide store for the configured data source. */
export function defaultDirectorStore(): DirectorStore {
  if (store) return store;
  const env = runtimeEnvSchema.parse(process.env);
  if (env.DATA_SOURCE === "live") {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required with DATA_SOURCE=live.");
    // Prepared statements are off so the same URL works behind PgBouncer in transaction mode.
    store = drizzleDirectorStore(drizzle(postgres(env.DATABASE_URL, { prepare: false })));
  } else {
    store = memoryDirectorStore();
  }
  return store;
}

/** Sample lines of the design, served in sample mode next to anything generated into memory. */
export const sampleLines = () => (directorDataSource() === "sample" ? SAMPLE_LINES : []);
