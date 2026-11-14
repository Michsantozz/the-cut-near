import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { cutContract } from "@/shared/near/contract";
import { getLiveParams } from "./api/live";
import { SAMPLE_PARAMS, SAMPLE_POOL, SAMPLE_TOTAL_SUPPLY, SAMPLE_USD_CENTS_PER_NEAR } from "./api/sample";
import type { Params, Pool } from "./model/types";

export async function getParams(): Promise<Params> {
  return dataSource() === "live" ? getLiveParams() : SAMPLE_PARAMS;
}

export async function getPool(): Promise<Pool> {
  return dataSource() === "live" ? cutContract().getPool() : SAMPLE_POOL;
}

/**
 * US cents per NEAR, to show $ values. The design's 1 NEAR = $2.50 in sample mode; null live, where the app
 * has no price feed yet, so screens show $CUT and NEAR amounts instead.
 */
export async function getUsdCentsPerNear(): Promise<bigint | null> {
  return dataSource() === "live" ? null : SAMPLE_USD_CENTS_PER_NEAR;
}

/** $CUT in existence now (`ft_total_supply`): the 10,000,000 minted at launch minus every burn. */
export async function getTotalSupply(): Promise<bigint> {
  return dataSource() === "live" ? cutContract().ftTotalSupply() : SAMPLE_TOTAL_SUPPLY;
}
