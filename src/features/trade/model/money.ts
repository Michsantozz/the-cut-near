import type { Pool } from "@/entities/market";
import { CUT_DECIMALS, NEAR_DECIMALS } from "@/shared/lib/amount";

// Conversions between NEAR, $CUT and US cents. Everything stays bigint; divisions that show money round half up,
// divisions that decide what is sent round down (never ask for more than was typed).

export const ONE_CUT = 10n ** BigInt(CUT_DECIMALS);
export const ONE_NEAR = 10n ** BigInt(NEAR_DECIMALS);

const roundDiv = (numerator: bigint, denominator: bigint) => (numerator * 2n + denominator) / (denominator * 2n);

/** yoctoNEAR to US cents, rounded half up. */
export function nearToUsdCents(yocto: bigint, usdCentsPerNear: bigint): bigint {
  return roundDiv(yocto * usdCentsPerNear, ONE_NEAR);
}

/** US cents to yoctoNEAR, rounded down. Zero without a rate. */
export function usdCentsToNear(cents: bigint, usdCentsPerNear: bigint): bigint {
  if (usdCentsPerNear <= 0n) return 0n;
  return (cents * ONE_NEAR) / usdCentsPerNear;
}

/** Spot price of one whole $CUT in yoctoNEAR, from the pool reserves. */
export function spotPrice(pool: Pick<Pool, "nearReserve" | "cutReserve">): bigint {
  if (pool.cutReserve <= 0n) return 0n;
  return (pool.nearReserve * ONE_CUT) / pool.cutReserve;
}

/** $CUT to yoctoNEAR at a price per whole $CUT, rounded down. */
export function cutToNear(cut: bigint, yoctoNearPerCut: bigint): bigint {
  return (cut * yoctoNearPerCut) / ONE_CUT;
}

/** $CUT to US cents at a price per whole $CUT, rounded half up. */
export function cutToUsdCents(cut: bigint, yoctoNearPerCut: bigint, usdCentsPerNear: bigint): bigint {
  return roundDiv(cut * yoctoNearPerCut * usdCentsPerNear, ONE_CUT * ONE_NEAR);
}

/** The average price of a trade in yoctoNEAR per whole $CUT. Zero when no $CUT moves. */
export function tradePrice(near: bigint, cut: bigint): bigint {
  return cut > 0n ? (near * ONE_CUT) / cut : 0n;
}

/** Share of a whole in basis points, rounded half up: 1,052,400 of 10,000,000 → 1052 (10.52%). */
export function shareBps(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number(roundDiv(part * 10_000n, whole));
}
