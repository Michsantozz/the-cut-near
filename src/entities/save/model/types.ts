/** $CUT a member locked into a robot's pile (or bench queue) until the next cut. */
export type Save = {
  accountId: string;
  robotId: string;
  amount: bigint;
  /** Index of the cut this save is locked for. */
  lockedForCut: number;
};
