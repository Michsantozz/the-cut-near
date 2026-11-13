import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { requireDatabaseUrl } from "@/shared/config/server";

/**
 * Any Drizzle Postgres database: the app's postgres.js client, or an in-process one in tests.
 * Data access takes this type, so it only uses the query builder (no driver-specific `execute`).
 */
export type Database = PgDatabase<PgQueryResultHKT>;

type Connection = { db: Database; close: () => Promise<void> };

// One pool per server process. Kept on globalThis so dev HMR reloads reuse it instead of leaking
// connections; on serverless each warm instance keeps its own small pool.
const globalForDb = globalThis as typeof globalThis & { __theCutDb?: Connection };

function connect(url: string): Connection {
  const sql = postgres(url, {
    // Off so the same URL works behind PgBouncer / managed poolers in transaction mode.
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    onnotice: () => {},
  });
  return { db: drizzle(sql), close: () => sql.end({ timeout: 5 }) };
}

/** The shared database client. Tables live next to their owner (`src/{shared,entities,features}/<slice>/db/schema.ts`). */
export function getDb(): Database {
  globalForDb.__theCutDb ??= connect(requireDatabaseUrl());
  return globalForDb.__theCutDb.db;
}

/** Closes the pool (scripts and tests). The next `getDb()` opens a new one. */
export async function closeDb(): Promise<void> {
  const connection = globalForDb.__theCutDb;
  globalForDb.__theCutDb = undefined;
  await connection?.close();
}
