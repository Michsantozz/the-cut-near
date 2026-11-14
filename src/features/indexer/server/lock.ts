import "server-only";
import { sql } from "drizzle-orm";
import type { Database } from "@/shared/db/client";

/** First half of the advisory lock key: keeps the indexer's locks apart from any other advisory lock. */
const LOCK_CLASS = 0x7c07;

export type Locked<T> = { acquired: true; value: T } | { acquired: false };

async function tryLock(db: Database, name: string): Promise<boolean> {
  const [row] = await db.select({ locked: sql<boolean>`pg_try_advisory_xact_lock(${LOCK_CLASS}, hashtext(${name}))` }).from(sql`(select 1) as one`);
  return row?.locked === true;
}

/**
 * Runs `fn` while holding the indexer's lock for `name`, so two indexer runs never overlap, on any
 * instance. The lock is a transaction-level Postgres advisory lock: it works behind PgBouncer-style
 * poolers in transaction mode (where a session lock could leak to another client) and Postgres
 * releases it when the transaction ends, also when the process dies mid-run. `fn` gets the
 * transaction and must do its writes through it, or with PGlite (one connection) it would wait on itself.
 *
 * Without `waitMs` it does not wait: a held lock returns `{ acquired: false }` at once. With
 * `waitMs` it retries until then and throws if the lock is still held.
 */
export async function withIndexerLock<T>(db: Database, name: string, fn: (tx: Database) => Promise<T>, { waitMs = 0, retryMs = 500 } = {}): Promise<Locked<T>> {
  return db.transaction(async (tx) => {
    const deadline = Date.now() + waitMs;
    while (!(await tryLock(tx, name))) {
      if (Date.now() + retryMs > deadline) {
        if (waitMs > 0) throw new Error(`The indexer for ${name} is still running after ${waitMs} ms.`);
        return { acquired: false } as const;
      }
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
    return { acquired: true, value: await fn(tx) } as const;
  });
}
