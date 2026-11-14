import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, lt, or, sum, type SQL } from "drizzle-orm";
import type { Database } from "@/shared/db/client";
import { journal, type JournalRow, type NewJournalRow } from "./db/schema";
import { CUT_STANDARD } from "./events";

export type JournalCursor = { blockHeight: number; id: number };

export type JournalQuery = {
  accountId?: string;
  agentId?: string;
  cutIndex?: number;
  events?: readonly string[];
  /** Page after this row (exclusive), newest first. */
  before?: JournalCursor;
  /** 1..200, default 50. */
  limit?: number;
};

/** Journal rows, newest first. */
export async function listJournal(db: Database, query: JournalQuery = {}): Promise<JournalRow[]> {
  const where: SQL[] = [];
  if (query.accountId) where.push(eq(journal.accountId, query.accountId));
  if (query.agentId) where.push(eq(journal.agentId, query.agentId));
  if (query.cutIndex !== undefined) where.push(eq(journal.cutIndex, query.cutIndex));
  if (query.events?.length) where.push(inArray(journal.event, [...query.events]));
  if (query.before) {
    const { blockHeight, id } = query.before;
    const older = or(lt(journal.blockHeight, blockHeight), and(eq(journal.blockHeight, blockHeight), lt(journal.id, id)));
    if (older) where.push(older);
  }
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
  return db
    .select()
    .from(journal)
    .where(and(...where))
    .orderBy(desc(journal.blockHeight), desc(journal.id))
    .limit(limit);
}

/** Inserts rows, skipping events already in the journal. Returns how many were new. */
export async function insertJournalRows(db: Database, rows: readonly NewJournalRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(journal)
    .values([...rows])
    .onConflictDoNothing({ target: [journal.receiptId, journal.logIndex, journal.itemIndex] })
    .returning({ id: journal.id });
  return inserted.length;
}

/** $CUT saved on each agent since `since` (sum of `save` events), keyed by agent id. */
export async function savedSince(db: Database, since: Date): Promise<Map<string, bigint>> {
  const rows = await db
    .select({ agentId: journal.agentId, total: sum(journal.amount) })
    .from(journal)
    .where(and(eq(journal.standard, CUT_STANDARD), eq(journal.event, "save"), gte(journal.blockTimestamp, since), isNotNull(journal.agentId)))
    .groupBy(journal.agentId);
  const totals = new Map<string, bigint>();
  for (const { agentId, total } of rows) if (agentId && total !== null) totals.set(agentId, BigInt(total));
  return totals;
}
