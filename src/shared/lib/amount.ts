/** $CUT and NEAR both use fixed-point integers on chain. */
export const CUT_DECIMALS = 18;
export const NEAR_DECIMALS = 24;

/** Whole units to the smallest unit, e.g. `units(182_400)` $CUT. Integers only. */
export function units(whole: number | bigint, decimals = CUT_DECIMALS): bigint {
  return BigInt(whole) * 10n ** BigInt(decimals);
}
