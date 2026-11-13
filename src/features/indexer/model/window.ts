/**
 * Blocks the indexer stays behind the source's head. A transaction is listed under the block it was
 * submitted in, but its receipts (and the contract's events) execute a few blocks later; scanning
 * only blocks this far back means a transaction is complete when it is read. 200 blocks is a few
 * minutes on testnet and mainnet, far above the usual 2-3 blocks a receipt chain takes.
 */
export const SAFETY_LAG_BLOCKS = 200;

export type ScanWindow = { from: number | null; to: number };

/**
 * The block range to scan, inclusive: from the cursor (or the account's first transaction when
 * there is none yet) up to `head - lag`. Null when there is nothing new.
 */
export function scanWindow(cursor: number | null, head: number, lag: number = SAFETY_LAG_BLOCKS): ScanWindow | null {
  const to = head - lag;
  if (to < 0) return null;
  if (cursor !== null && cursor > to) return null;
  return { from: cursor, to };
}
