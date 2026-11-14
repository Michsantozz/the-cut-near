/** An agent on the stage, on the bench, or deleted by a cut. Mirrors `AgentView` in docs/contract-interface.md. */
export type AgentStatus = "stage" | "bench" | "deleted";

export type Agent = {
  id: string;
  accountId: string;
  name: string;
  kind: string;
  xHandle: string;
  creator: string;
  status: AgentStatus;
  /** $CUT saved on it, in yocto-$CUT (18 decimals). On the bench this is its queue. */
  pile: bigint;
  savers: number;
  /** $CUT saved on it since the start of the current UTC day, for the "Today" column. */
  savedToday: bigint;
  joinedAt: Date;
};
