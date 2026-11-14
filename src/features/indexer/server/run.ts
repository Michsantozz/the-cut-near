import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@/shared/db/client";
import { insertJournalRows } from "@/shared/near/journal";
import { indexerCursor } from "../db/schema";
import { extractEvents, isComplete } from "../model/transactions";
import { SAFETY_LAG_BLOCKS, scanWindow } from "../model/window";
import { MAX_HASHES_PER_REQUEST, TxApiError, type TxSource } from "./tx-api";

export type IndexerRun = { db: Database; source: TxSource; contractId: string; maxPages?: number; lag?: number };

export type IndexerReport =
  | { status: "up_to_date"; head: number; nextBlockHeight: number | null }
  | { status: "caught_up" | "partial"; from: number | null; to: number; pages: number; transactions: number; events: number; inserted: number; nextBlockHeight: number };

export const cursorName = (contractId: string) => `journal:${contractId}`;

async function readCursor(db: Database, name: string): Promise<number | null> {
  const [row] = await db.select({ next: indexerCursor.nextBlockHeight }).from(indexerCursor).where(eq(indexerCursor.name, name));
  return row?.next ?? null;
}

/** Moves the cursor forward only: a slower concurrent run can never rewind it. */
async function advanceCursor(db: Database, name: string, nextBlockHeight: number): Promise<void> {
  await db
    .insert(indexerCursor)
    .values({ name, nextBlockHeight, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: indexerCursor.name,
      set: { nextBlockHeight: sql`greatest(${indexerCursor.nextBlockHeight}, excluded.next_block_height)`, updatedAt: new Date() },
    });
}

/**
 * Ingests the contract's NEP-297 events into the journal, oldest first, resuming at the cursor.
 * Idempotent: events are keyed by (receipt, log, item) and inserted with ON CONFLICT DO NOTHING,
 * and the cursor only advances past a page once every transaction in it was stored. Re-running,
 * or two runs at once, re-reads at most one page and never duplicates a row.
 *
 * With a `lag` below SAFETY_LAG_BLOCKS (the on-demand catch-up), a transaction from the last
 * SAFETY_LAG_BLOCKS blocks may still have receipts in flight. Such a transaction, or one the source
 * cannot return yet, stops the run with the cursor at its block, so the next run reads it again.
 */
export async function runIndexer({ db, source, contractId, maxPages = 10, lag = SAFETY_LAG_BLOCKS }: IndexerRun): Promise<IndexerReport> {
  const name = cursorName(contractId);
  const cursor = await readCursor(db, name);
  const head = await source.head();
  const window = scanWindow(cursor, head, lag);
  if (!window) return { status: "up_to_date", head, nextBlockHeight: cursor };

  let resumeToken: string | undefined;
  let pages = 0;
  let transactions = 0;
  let events = 0;
  let inserted = 0;
  let nextBlockHeight = window.from ?? 0;
  // Lowest block of a recent transaction that is not finished yet: the run stops there.
  let unfinishedAt: number | null = null;

  do {
    const page = await source.accountTxs({ accountId: contractId, from: window.from, to: window.to, resumeToken });
    const blockOf = new Map(page.txs.map((tx) => [tx.hash, tx.blockHeight]));
    const recent = (hash: string) => (blockOf.get(hash) ?? 0) > head - SAFETY_LAG_BLOCKS;
    const hashes = [...new Set(page.txs.map((tx) => tx.hash))];
    for (let i = 0; i < hashes.length; i += MAX_HASHES_PER_REQUEST) {
      const chunk = hashes.slice(i, i + MAX_HASHES_PER_REQUEST);
      const txs = await source.transactions(chunk);
      // A listed transaction the source cannot return yet must not be skipped: stop before the cursor moves.
      const missing = chunk.filter((hash) => !txs.some((tx) => tx.transaction.hash === hash));
      const missingOld = missing.filter((hash) => !recent(hash));
      if (missingOld.length > 0) throw new TxApiError(`Transactions not available yet: ${missingOld.join(", ")}`);
      // Events of receipts that already ran are final, so they are stored now; the cursor waits for the rest.
      const unfinished = [...missing, ...txs.filter((tx) => recent(tx.transaction.hash) && !isComplete(tx)).map((tx) => tx.transaction.hash)];
      for (const hash of unfinished) unfinishedAt = Math.min(unfinishedAt ?? Infinity, blockOf.get(hash) ?? Infinity);
      const rows = txs.flatMap((tx) => extractEvents(tx, contractId));
      events += rows.length;
      inserted += await insertJournalRows(db, rows);
    }
    pages += 1;
    transactions += hashes.length;
    resumeToken = page.resumeToken ?? undefined;
    // An unfinished transaction: resume next time at its block (inclusive).
    // More pages: resume next time at the last block seen (inclusive; its rows are already stored).
    // Last page: everything up to the window's end has been read.
    if (unfinishedAt !== null) nextBlockHeight = unfinishedAt;
    else nextBlockHeight = resumeToken ? (page.txs.at(-1)?.blockHeight ?? nextBlockHeight) : window.to + 1;
    await advanceCursor(db, name, nextBlockHeight);
  } while (resumeToken && pages < maxPages && unfinishedAt === null);

  const done = !resumeToken && unfinishedAt === null;
  return { status: done ? "caught_up" : "partial", from: window.from, to: window.to, pages, transactions, events, inserted, nextBlockHeight };
}
