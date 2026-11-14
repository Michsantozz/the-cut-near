/** The next cut, as read from `get_next_cut`. */
export type NextCut = {
  index: number;
  at: Date;
  /** Null while the stage is not full: the cut then only seats bench robots. */
  lowestId: string | null;
  /** $CUT the lowest robot needs to pass the next one. */
  gapToNext: bigint;
  prizeSoFar: bigint;
};

/** A cut that already ran, as read from `get_cut`. */
export type CutRecord = {
  index: number;
  at: Date;
  /** Null for a cut that only seated bench robots (the stage was not full). */
  deletedId: string | null;
  pile: bigint;
  burned: bigint;
  prize: bigint;
  /** One equal slice per surviving robot, shared by its savers. */
  slice: bigint;
  creatorSlice: bigint;
  joinedId: string | null;
  runner: string;
};

/** A cut that deleted a robot. The first cuts after launch only seat bench robots and delete nobody. */
export type DeletingCut = CutRecord & { deletedId: string };

export function isDeletingCut(cut: CutRecord): cut is DeletingCut {
  return cut.deletedId !== null;
}
