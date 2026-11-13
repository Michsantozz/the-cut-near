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
  robotFunding: bigint;
  registerDeposit: bigint;
};
