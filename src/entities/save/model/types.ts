/** $CUT a member locked into an agent's pile (or bench queue) until the next cut. */
export type Save = {
  accountId: string;
  agentId: string;
  amount: bigint;
  /** Index of the cut this save is locked for. */
  lockedForCut: number;
};
