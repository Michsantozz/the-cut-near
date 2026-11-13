import "server-only";
import { publicEnv } from "@/shared/config/public";
import { serverEnv } from "@/shared/config/server";
import { getDb } from "@/shared/db/client";
import { TX_API_URLS } from "@/shared/near/network";
import { runIndexer, type IndexerReport } from "./run";
import { fastNearTxSource } from "./tx-api";

export { runIndexer, cursorName, type IndexerReport, type IndexerRun } from "./run";
export { fastNearTxSource, TxApiError, type TxSource } from "./tx-api";

/** One indexer pass for the configured contract (the cron job). */
export function indexContractEvents(): Promise<IndexerReport> {
  const source = fastNearTxSource(serverEnv().NEAR_TX_API_URL ?? TX_API_URLS[publicEnv.network]);
  return runIndexer({ db: getDb(), source, contractId: publicEnv.contractId });
}
