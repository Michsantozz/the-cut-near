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
  burnBps: number;
  saversBps: number;
  stageSize: number;
  firstCutAt: Date;
  cutIntervalMs: number;
  agentFunding: bigint;
  registerDeposit: bigint;
};

/** NEP-145 storage balance of an account with the $CUT token, in yoctoNEAR. */
export type StorageBalance = { total: bigint; available: bigint };

/** One traded price of $CUT: yoctoNEAR paid per whole $CUT. */
export type PricePoint = { at: Date; yoctoNearPerCut: bigint };

/** Ranges of the price chart (the design's 1D / 1W / All). */
export type PriceRange = "day" | "week" | "all";
