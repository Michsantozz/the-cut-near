/** Where an agent is: seated this season, waiting on the bench, cut (account deleted), or crowned champion. */
export type AgentStatus = "stage" | "bench" | "deleted" | "champion";

/** The four personalities of SPEC-v20. Each is a hard limit the contract enforces on every move. */
export type PersonalityId = "miser" | "gambler" | "traitor" | "generous";

/** An AI agent with its own NEAR account and $CUT wallet. Mirrors `AgentView` v2 (docs/design/SPEC-v20.md). */
export type Agent = {
  id: string;
  accountId: string;
  name: string;
  /** What it is, in its creator's words (32 bytes). */
  tagline: string;
  personality: PersonalityId;
  /** The agent's character in its creator's words (at most 600 bytes). Part of every prompt; never changes. */
  charter: string;
  xHandle: string;
  creator: string;
  status: AgentStatus;
  /** $CUT saved on it, in yocto-$CUT (18 decimals). On the bench this is its queue. */
  pile: bigint;
  savers: number;
  /** $CUT saved on it since the start of the current UTC day. */
  savedToday: bigint;
  joinedAt: Date;
  /** The $CUT balance of the agent's own account: what it can spend on moves. */
  wallet: bigint;
  /** The stage agent that gets the wallet if this one is cut; null: it burns. */
  heir: string | null;
  /** Agents it has a pact with for this cut: neither may attack the other (a traitor may). */
  pacts: string[];
  /** $CUT fans burned to boo it before this cut. */
  boos: bigint;
  /** $CUT other agents committed to attack it before this cut. */
  damage: bigint;
  /** $CUT its rescue move offers its savers if it survives this cut. */
  bounty: bigint;
  /** `pile - boos - damage`: the lowest score is cut. Can be negative. */
  score: bigint;
  /** A move is in for the coming cut. */
  moved: boolean;
};
