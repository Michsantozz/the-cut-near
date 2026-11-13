import "server-only";
import { getDb } from "@/shared/db/client";
import type { JournalRow } from "@/shared/near/db/schema";
import { listJournal } from "@/shared/near/journal";
import type { JournalEntry, JournalFilter, JournalPage } from "../model/types";

export function toJournalEntry(row: JournalRow): JournalEntry {
  return {
    id: `${row.receiptId}:${row.logIndex}:${row.itemIndex}`,
    standard: row.standard,
    event: row.event,
    at: row.blockTimestamp,
    txHash: row.txHash,
    blockHeight: row.blockHeight,
    accountId: row.accountId,
    robotId: row.robotId,
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
