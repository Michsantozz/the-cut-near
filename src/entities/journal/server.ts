import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { getLiveJournal } from "./api/live";
import { SAMPLE_JOURNAL } from "./api/sample";
import type { JournalFilter, JournalPage } from "./model/types";

/**
 * Contract events, newest first, filtered by account, robot, cut or event name. Live reads the
 * journal the indexer fills (a few minutes behind the chain); sample serves the design's history.
 */
export async function getJournal(filter: JournalFilter = {}): Promise<JournalPage> {
  if (dataSource() === "live") return getLiveJournal(filter);
  const entries = SAMPLE_JOURNAL.filter(
    (e) =>
      (filter.accountId === undefined || e.accountId === filter.accountId) &&
      (filter.robotId === undefined || e.robotId === filter.robotId) &&
      (filter.cutIndex === undefined || e.cutIndex === filter.cutIndex) &&
      (filter.events === undefined || filter.events.includes(e.event)),
  );
  return { entries: entries.slice(0, filter.limit ?? 50), next: null };
}
