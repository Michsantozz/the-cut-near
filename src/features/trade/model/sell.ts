import { CUT_DECIMALS, toDecimalText } from "@/shared/lib/amount";

// The Sell screen: only free $CUT can be sold; saved $CUT stays locked in the agent's pile until the cut.

const TENTH = 10n ** BigInt(CUT_DECIMALS - 1);

/** Share presets of the free $CUT, in percent. 100 is "All free". */
export const SELL_PRESETS = [25, 50, 75, 100] as const;

/** `percent` of the free balance, rounded down to 0.1 $CUT (all of it for 100%). */
export function sellShare(free: bigint, percent: number): bigint {
  if (percent >= 100) return free;
  return ((free * BigInt(percent)) / 100n / TENTH) * TENTH;
}

/** The amount the screen opens with: half the free $CUT (the design's 137.1 of 274.2). */
export const defaultSell = (free: bigint) => sellShare(free, 50);

/** The field text for an amount: up to 2 decimals, rounded down. */
export const cutToInput = (value: bigint) => toDecimalText(value, CUT_DECIMALS, 2);
