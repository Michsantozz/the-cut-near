import "server-only";
import { eq } from "drizzle-orm";
import type { Database } from "@/shared/db/client";
import { indexerCursor } from "../db/schema";
import { withIndexerLock } from "./lock";
import { cursorName, runIndexer, type IndexerReport } from "./run";
import type { TxSource } from "./tx-api";

/** At most one on-demand catch-up per this interval, across every request and instance. */
export const CATCH_UP_INTERVAL_MS = 30_000;

/**
 * Blocks the on-demand catch-up stays behind the source's head (about 12 s on NEAR). Far below
 * SAFETY_LAG_BLOCKS: the indexer then waits on any recent transaction whose receipts are still in flight.
 */
export const CATCH_UP_LAG_BLOCKS = 20;

export type CatchUpRun = {
  db: Database;
  source: TxSource;
  contractId: string;
  /** One page is up to 200 transactions: plenty between two catch-ups, and quick enough to wait for. */
  maxPages?: number;
  lag?: number;
  intervalMs?: number;
  now?: () => number;
};

export type CatchUpResult =
  /** Some indexer run (cron or on-demand) started less than `intervalMs` ago. */
  | { status: "throttled" }
  /** Another run holds the lock right now. */
  | { status: "busy" }
  | { status: "ran"; report: IndexerReport }
  | { status: "failed"; error: string };

/** When the last indexer run for `name` finished or gave up: the cursor row's `updated_at`. */
async function lastRunAt(db: Database, name: string): Promise<number | null> {
  const [row] = await db.select({ at: indexerCursor.updatedAt }).from(indexerCursor).where(eq(indexerCursor.name, name));
  return row ? row.at.getTime() : null;
}

/**
 * One bounded indexer run on demand, for pages that show the journal (Receipts). It runs only if
 * no indexer run touched the cursor in the last `intervalMs`, and only while holding the indexer's
 * lock, which it never waits for. The throttle is read again under the lock, so two requests that
 * both saw a stale journal still start one run. A finished or failed run stamps the cursor, so a
 * source outage costs one request per interval, not one per page view.
 */
export async function catchUpJournal({ db, source, contractId, maxPages = 1, lag = CATCH_UP_LAG_BLOCKS, intervalMs = CATCH_UP_INTERVAL_MS, now = Date.now }: CatchUpRun): Promise<CatchUpResult> {
  const name = cursorName(contractId);
  const fresh = async (handle: Database) => {
    const at = await lastRunAt(handle, name);
    return at !== null && now() - at < intervalMs;
  };
  // Most page views stop here, without opening a transaction.
  if (await fresh(db)) return { status: "throttled" };

  const locked = await withIndexerLock(db, name, async (tx): Promise<CatchUpResult> => {
    if (await fresh(tx)) return { status: "throttled" };
    let result: CatchUpResult;
    try {
      result = { status: "ran", report: await runIndexer({ db: tx, source, contractId, maxPages, lag }) };
    } catch (error) {
      result = { status: "failed", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    }
    // Before the first page is stored there is no cursor row yet, and nothing to stamp.
    await tx.update(indexerCursor).set({ updatedAt: new Date(now()) }).where(eq(indexerCursor.name, name));
    return result;
  });
  return locked.acquired ? locked.value : { status: "busy" };
}
