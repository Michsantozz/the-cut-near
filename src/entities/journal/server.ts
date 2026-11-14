import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { getLiveJournal, getLiveJournalStats } from "./api/live";
import { sampleJournal } from "./api/sample";
import { journalStats } from "./model/stats";
import type { JournalEntry, JournalFilter, JournalPage, JournalStats } from "./model/types";

export { SAMPLE_CONTRACT_ID } from "./api/sample";

/**
 * Contract events, newest first, filtered by account, agent, cut or event name, one page at a time
 * (pass `next` back as `before`). Live reads the journal the indexer fills (a few minutes behind the
 * chain); sample serves the sample world's history (SPEC-v20, season 1 day 4).
 */
export async function getJournal(filter: JournalFilter = {}): Promise<JournalPage> {
  if (dataSource() === "live") return getLiveJournal(filter);
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const matches = sampleJournal().filter((e) => matchesFilter(e, filter));
  const page = matches.slice(0, limit);
  const last = page.at(-1);
  return { entries: page, next: matches.length > limit && last ? { blockHeight: last.blockHeight, id: 0 } : null };
}

/** Totals over the whole journal: entries, minted, burned, saved, cuts, buyers. */
export async function getJournalStats(): Promise<JournalStats> {
  if (dataSource() === "live") return getLiveJournalStats();
  return journalStats(sampleJournal());
}

function matchesFilter(e: JournalEntry, filter: JournalFilter): boolean {
  return (
    (filter.accountId === undefined || e.accountId === filter.accountId) &&
    (filter.agentId === undefined || e.agentId === filter.agentId) &&
    (filter.cutIndex === undefined || e.cutIndex === filter.cutIndex) &&
    (filter.events === undefined || filter.events.includes(e.event)) &&
    (filter.before === undefined || e.blockHeight < filter.before.blockHeight)
  );
}
