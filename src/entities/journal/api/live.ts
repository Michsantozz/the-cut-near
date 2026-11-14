import "server-only";
import { and, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/shared/db/client";
import { journal, type JournalRow } from "@/shared/near/db/schema";
import { listJournal } from "@/shared/near/journal";
import type { JournalEntry, JournalFilter, JournalPage, JournalStats } from "../model/types";

export function toJournalEntry(row: JournalRow): JournalEntry {
  return {
    id: `${row.receiptId}:${row.logIndex}:${row.itemIndex}`,
    standard: row.standard,
    event: row.event,
    at: row.blockTimestamp,
    txHash: row.txHash,
    blockHeight: row.blockHeight,
    accountId: row.accountId,
    agentId: row.agentId,
    cutIndex: row.cutIndex,
    amount: row.amount,
    data: row.data,
  };
}

export async function getLiveJournal(filter: JournalFilter): Promise<JournalPage> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const rows = await listJournal(getDb(), { ...filter, limit });
  const last = rows.at(-1);
  return { entries: rows.map(toJournalEntry), next: rows.length === limit && last ? { blockHeight: last.blockHeight, id: last.id } : null };
}

const sumOf = (expr: SQL, event: string) => sql<string | null>`coalesce(sum(${expr}) filter (where ${journal.event} = ${event}), 0)::text`;

/** Totals over the whole journal in one scan, plus the registered agent ids. */
export async function getLiveJournalStats(): Promise<JournalStats> {
  const db = getDb();
  const pile = sql`(${journal.data}->>'pile')::numeric`;
  const [totals] = await db
    .select({
      entries: sql<number>`count(*)::int`,
      firstAt: sql<Date | null>`min(${journal.blockTimestamp})`,
      latestBlock: sql<number | null>`max(${journal.blockHeight})`,
      minted: sumOf(sql`${journal.amount}`, "ft_mint"),
      burned: sumOf(sql`${journal.amount}`, "ft_burn"),
      saves: sumOf(sql`${journal.amount}`, "save"),
      unsaves: sumOf(sql`${journal.amount}`, "unsave"),
      cutPiles: sumOf(pile, "cut"),
      cuts: sql<number>`(count(*) filter (where ${journal.event} = 'cut'))::int`,
      buyers: sql<number>`(count(distinct ${journal.accountId}) filter (where ${journal.event} = 'buy'))::int`,
    })
    .from(journal);
  const registered = await db
    .selectDistinct({ agentId: journal.agentId })
    .from(journal)
    .where(and(eq(journal.event, "register"), isNotNull(journal.agentId)));
  const big = (value: string | null | undefined) => BigInt(value ?? "0");
  return {
    entries: Number(totals?.entries ?? 0),
    firstAt: totals?.firstAt ? new Date(totals.firstAt) : null,
    latestBlock: totals?.latestBlock === null || totals?.latestBlock === undefined ? null : Number(totals.latestBlock),
    minted: big(totals?.minted),
    burned: big(totals?.burned),
    saved: big(totals?.saves) - big(totals?.unsaves) - big(totals?.cutPiles),
    cuts: Number(totals?.cuts ?? 0),
    buyers: Number(totals?.buyers ?? 0),
    registered: registered.flatMap((r) => (r.agentId ? [r.agentId] : [])).sort(),
  };
}
