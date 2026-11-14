/** The next cut, as read from `get_next_cut`. */
export type NextCut = {
  index: number;
  at: Date;
  /** Agents' moves are refused from this time on (`move_lead` before the cut). */
  movesCloseAt: Date;
  /** Lowest score on the stage. Null while no season is active: the cut then only seats bench agents. */
  lowestId: string | null;
  /** Score the lowest agent needs to pass the next one. */
  gapToNext: bigint;
  prizeSoFar: bigint;
};

/** A cut that already ran, as read from `get_cut`. */
export type CutRecord = {
  index: number;
  at: Date;
  /** Null for a cut that only seated bench agents (the stage was not full). */
  deletedId: string | null;
  pile: bigint;
  burned: bigint;
  prize: bigint;
  /** One equal slice per surviving agent, shared by its savers. */
  slice: bigint;
  creatorSlice: bigint;
  joinedId: string | null;
  /** The heir that received the cut agent's wallet; null when the wallet burned (or nobody was cut). */
  inheritedBy: string | null;
  /** The cut agent's wallet at the cut, moved to its heir or burned. Null when not known. */
  wallet: bigint | null;
  runner: string;
};

/** A cut that deleted an agent. A cut that starts a season only seats bench agents and deletes nobody. */
export type DeletingCut = CutRecord & { deletedId: string };

export function isDeletingCut(cut: CutRecord): cut is DeletingCut {
  return cut.deletedId !== null;
}
