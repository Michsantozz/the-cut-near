import { PGlite } from "@electric-sql/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/pglite";
import * as indexerSchema from "@/features/indexer/db/schema";
import * as authSchema from "@/shared/auth/db/schema";
import type { Database } from "@/shared/db/client";
import * as nearSchema from "@/shared/near/db/schema";

/** Every table the platform owns, as drizzle-kit sees them. */
const schema = { ...authSchema, ...nearSchema, ...indexerSchema };

export type TestDb = { db: Database; client: PGlite; reset: () => Promise<void>; close: () => Promise<void> };

/** PGlite boots a WebAssembly Postgres: give hooks that create one more than the default 5 s. */
export const DB_SETUP_TIMEOUT_MS = 60_000;

/**
 * A real Postgres (PGlite, in process) with the current schemas applied, for hermetic integration
 * tests. The DDL comes from the same diff drizzle-kit uses for migrations, so it cannot drift
 * from the schema files.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  for (const statement of statements) await client.exec(statement);
  const db: Database = drizzle(client);
  const reset = async () => {
    await client.exec("truncate auth_nonce, indexer_cursor, journal restart identity");
  };
  return { db, client, reset, close: () => client.close() };
}
