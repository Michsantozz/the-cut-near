import "server-only";

import { SAMPLE_PARAMS, SAMPLE_POOL } from "./api/sample";
import type { Params, Pool } from "./model/types";

export async function getParams(): Promise<Params> {
  return SAMPLE_PARAMS;
}

export async function getPool(): Promise<Pool> {
  return SAMPLE_POOL;
}
