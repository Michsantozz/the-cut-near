import { CUT_DECIMALS, NEAR_DECIMALS } from "@/shared/lib/amount";

import type { Pool } from "./types";

// $CUT valued at the pool's spot price.

const ONE_CUT = 10n ** BigInt(CUT_DECIMALS);
const ONE_NEAR = 10n ** BigInt(NEAR_DECIMALS);

/** Spot price of 1 $CUT in yoctoNEAR, from the pool reserves. */
export function cutPriceInYoctoNear(pool: Pick<Pool, "nearReserve" | "cutReserve">): bigint {
  if (pool.cutReserve <= 0n) return 0n;
  return (pool.nearReserve * ONE_CUT) / pool.cutReserve;
}

/** Value of a $CUT balance in US cents at the pool's spot price, rounded half up. */
export function valueInUsdCents(balance: bigint, pool: Pick<Pool, "nearReserve" | "cutReserve">, usdCentsPerNear: bigint): bigint {
  if (pool.cutReserve <= 0n) return 0n;
  const numerator = balance * pool.nearReserve * usdCentsPerNear;
  const denominator = pool.cutReserve * ONE_NEAR;
  return (numerator * 2n + denominator) / (denominator * 2n);
}
