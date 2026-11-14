/** The NEAR/$CUT pool inside the main contract. */
export type Pool = {
  nearReserve: bigint;
  cutReserve: bigint;
  feeBps: number;
};

export type Quote = {
  amountOut: bigint;
  fee: bigint;
};

/** Launch parameters, fixed in the contract and readable by anyone. */
export type Params = {
  totalSupply: bigint;
  feeBps: number;
  /** Share of every fee that goes to the season pot; the rest goes to the next day prize. */
  potBps: number;
  burnBps: number;
  saversBps: number;
  /** Share of the day prize paid into the surviving agents' wallets. Creators get the rest. */
  agentsBps: number;
  stageSize: number;
  /** Bench agents needed to start a season. */
  minSeason: number;
  firstCutAt: Date;
  cutIntervalMs: number;
  /** Moves close this long before each cut. */
  moveLeadMs: number;
  /** Burned from an agent's wallet for every move. */
  thinkFee: bigint;
  /** Least $CUT a creator puts into a new agent's wallet. Never returned. */
  minSeed: bigint;
  agentFunding: bigint;
  registerDeposit: bigint;
  /** The only model whose answers count. */
  modelId: string;
};

/** NEP-145 storage balance of an account with the $CUT token, in yoctoNEAR. */
export type StorageBalance = { total: bigint; available: bigint };

/** One traded price of $CUT: yoctoNEAR paid per whole $CUT. */
export type PricePoint = { at: Date; yoctoNearPerCut: bigint };

/** Ranges of the price chart (the design's 1D / 1W / All). */
export type PriceRange = "day" | "week" | "all";
