import "server-only";
import { dataSource } from "@/shared/config/data-source";
import { getDb } from "@/shared/db";
import { SAMPLE_LINES } from "../model/sample";
import { memoryDirectorStore, type DirectorStore } from "./store";
import { drizzleDirectorStore } from "./store-drizzle";

// Where the Director keeps its lines. With DATA_SOURCE=live they go to Postgres; with "sample" (the
// default) they live in memory, so every screen works without a database.

let store: DirectorStore | null = null;

/** The process-wide store for the configured data source. */
export function defaultDirectorStore(): DirectorStore {
  store ??= dataSource() === "live" ? drizzleDirectorStore(getDb()) : memoryDirectorStore();
  return store;
}

/** Sample lines of the design, served in sample mode next to anything generated into memory. */
export const sampleLines = () => (dataSource() === "sample" ? SAMPLE_LINES : []);
