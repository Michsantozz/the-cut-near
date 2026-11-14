import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { cutContract } from "@/shared/near/contract";
import { getLiveParams } from "./api/live";
import { SAMPLE_PARAMS, SAMPLE_POOL } from "./api/sample";
import type { Params, Pool } from "./model/types";

export async function getParams(): Promise<Params> {
  return dataSource() === "live" ? getLiveParams() : SAMPLE_PARAMS;
}

export async function getPool(): Promise<Pool> {
  return dataSource() === "live" ? cutContract().getPool() : SAMPLE_POOL;
}

/** $CUT in existence now: minted once at launch, minus every burn. */
export async function getTotalSupply(): Promise<bigint> {
  return dataSource() === "live" ? cutContract().ftTotalSupply() : SAMPLE_PARAMS.totalSupply;
}
