/** The next cut, as read from `get_next_cut`. */
export type NextCut = {
  index: number;
  at: Date;
  /** Null while the stage is not full: the cut then only seats bench agents. */
  lowestId: string | null;
  /** $CUT the lowest agent needs to pass the next one. */
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
  runner: string;
};

/** A cut that deleted an agent. The first cuts after launch only seat bench agents and delete nobody. */
export type DeletingCut = CutRecord & { deletedId: string };

export function isDeletingCut(cut: CutRecord): cut is DeletingCut {
  return cut.deletedId !== null;
}
