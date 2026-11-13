/** A cron that fires this close before the cut waits for it instead of missing the day. */
export const MAX_WAIT_MS = 45_000;

export type NextCutTime = { index: number; at: Date };

export type CutDecision =
  | { action: "run"; index: number }
  | { action: "wait"; index: number; waitMs: number }
  | { action: "skip"; reason: "too_early"; index: number; dueAt: Date };

/**
 * Whether to call `run_cut` now. `chainNow` is the latest final block's timestamp, the clock the
 * contract checks (`env::block_timestamp()`), not the server's: a transaction lands in a later block,
 * so "due by the final block" means the contract will not refuse it as early.
 */
export function decideCut(next: NextCutTime, chainNow: Date, maxWaitMs: number = MAX_WAIT_MS): CutDecision {
  const dueInMs = next.at.getTime() - chainNow.getTime();
  if (dueInMs <= 0) return { action: "run", index: next.index };
  if (dueInMs <= maxWaitMs) return { action: "wait", index: next.index, waitMs: dueInMs };
  return { action: "skip", reason: "too_early", index: next.index, dueAt: next.at };
}

/**
 * After a `run_cut` that failed or did not report success: the cut ran (ours or someone else's,
 * since anyone may run it) exactly when the contract has moved on to a later cut.
 */
export function cutHasRun(before: NextCutTime, after: NextCutTime): boolean {
  return after.index > before.index;
}
