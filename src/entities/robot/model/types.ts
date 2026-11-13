/** A robot on the stage, on the bench, or deleted by a cut. Mirrors `RobotView` in docs/contract-interface.md. */
export type RobotStatus = "stage" | "bench" | "deleted";

export type Robot = {
  id: string;
  accountId: string;
  name: string;
  kind: string;
  xHandle: string;
  creator: string;
  status: RobotStatus;
  /** $CUT saved on it, in yocto-$CUT (18 decimals). On the bench this is its queue. */
  pile: bigint;
  savers: number;
  /** $CUT saved on it since the start of the current UTC day, for the "Today" column. */
  savedToday: bigint;
  joinedAt: Date;
};
