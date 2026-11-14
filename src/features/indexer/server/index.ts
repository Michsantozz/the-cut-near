import "server-only";
import { after, connection } from "next/server";
import { isLive } from "@/shared/config/data-source";
import { publicEnv } from "@/shared/config/public";
import { serverEnv } from "@/shared/config/server";
import { getDb } from "@/shared/db/client";
import { TX_API_URLS } from "@/shared/near/network";
import { catchUpJournal, type CatchUpResult } from "./catch-up";
import { withIndexerLock } from "./lock";
import { cursorName, runIndexer, type IndexerReport } from "./run";
import { fastNearTxSource } from "./tx-api";

export { runIndexer, cursorName, type IndexerReport, type IndexerRun } from "./run";
export { fastNearTxSource, TxApiError, type TxSource } from "./tx-api";
export { catchUpJournal, CATCH_UP_INTERVAL_MS, CATCH_UP_LAG_BLOCKS, type CatchUpResult, type CatchUpRun } from "./catch-up";
export { withIndexerLock, type Locked } from "./lock";

const txApiUrl = () => serverEnv().NEAR_TX_API_URL ?? TX_API_URLS[publicEnv.network];

/** A cron run waits this long for an on-demand catch-up that holds the lock (they take seconds). */
const CRON_LOCK_WAIT_MS = 30_000;

/** One indexer pass for the configured contract (the cron job), never alongside another run. */
export async function indexContractEvents(): Promise<IndexerReport> {
  const source = fastNearTxSource(txApiUrl());
  const contractId = publicEnv.contractId;
  const locked = await withIndexerLock(getDb(), cursorName(contractId), (db) => runIndexer({ db, source, contractId }), { waitMs: CRON_LOCK_WAIT_MS });
  if (!locked.acquired) throw new Error("The indexer lock was not acquired.");
  return locked.value;
}

/** How long a page waits for its catch-up before it renders what the journal has. */
const REFRESH_WAIT_MS = 2_500;

/**
 * Brings the journal up to the chain for a page that shows it, without a public endpoint: at most
 * one bounded run per CATCH_UP_INTERVAL_MS across all requests (see `catchUpJournal`). It waits up
 * to `waitMs` for that run; a slower one goes on after the response (`after`), and the result is
 * "updating" so the page can say so and load again. Never throws: a stale journal is still honest.
 */
export async function refreshJournal({ waitMs = REFRESH_WAIT_MS }: { waitMs?: number } = {}): Promise<"fresh" | "updating"> {
  if (!isLive()) return "fresh";
  await connection();
  const run: Promise<CatchUpResult> = catchUpJournal({
    db: getDb(),
    // Short timeouts: the run is bounded by the page's maxDuration, and the next one is 30 s away anyway.
    source: fastNearTxSource(txApiUrl(), { timeoutMs: 8_000 }),
    contractId: publicEnv.contractId,
  })
    .catch((error: unknown): CatchUpResult => ({ status: "failed", error: String(error) }))
    .then((result) => {
      if (result.status === "failed") console.error("[indexer:catch-up]", result.error);
      return result;
    });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  const settled = await Promise.race([run, timeout]);
  clearTimeout(timer);
  if (settled === null) {
    after(run);
    return "updating";
  }
  // Another request's run holds the lock: its rows land in a moment.
  return settled.status === "busy" ? "updating" : "fresh";
}
