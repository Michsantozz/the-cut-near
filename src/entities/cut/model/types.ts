/** The next cut, as read from `get_next_cut`. */
export type NextCut = {
  index: number;
  at: Date;
  lowestId: string;
  /** $CUT the lowest robot needs to pass the next one. */
  gapToNext: bigint;
  prizeSoFar: bigint;
};

/** A cut that already ran, as read from `get_cut`. */
export type CutRecord = {
  index: number;
  at: Date;
  deletedId: string;
  pile: bigint;
  burned: bigint;
  prize: bigint;
  /** One equal slice per surviving robot, shared by its savers. */
  slice: bigint;
  creatorSlice: bigint;
  joinedId: string | null;
  runner: string;
};
