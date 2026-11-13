import { units, NEAR_DECIMALS } from "@/shared/lib/amount";
import type { Params, Pool } from "../model/types";

export const SAMPLE_PARAMS: Params = {
  totalSupply: units(10_000_000),
  feeBps: 100,
  burnBps: 5_000,
  saversBps: 9_500,
  stageSize: 10,
  firstCutAt: new Date("2026-11-13T18:00:00Z"),
  cutIntervalMs: 86_400_000,
  robotFunding: units(5, NEAR_DECIMALS) / 10n,
  registerDeposit: units(5, NEAR_DECIMALS),
};

/** $CUT at $1.84 with 1 NEAR = $2.50: 0.736 NEAR per $CUT. */
export const SAMPLE_POOL: Pool = {
  nearReserve: units(736_000, NEAR_DECIMALS),
  cutReserve: units(1_000_000),
  feeBps: 100,
};
