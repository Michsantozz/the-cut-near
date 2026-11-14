import { units } from "@/shared/lib/amount";

// What a cut pays, rounded exactly like the contract (`contracts/thecut/src/math.rs`, SPEC-v19 §2).

const BPS = 10_000n;
const HUNDRED_CUT = units(100);

export type SplitParams = { burnBps: number; saversBps: number; stageSize: number };

/**
 * One survivor's equal slice if `pile` is cut with `fees` in the pot: the unburned part of the pile plus
 * the fees is the prize, `saversBps` of it goes to savers, split into one slice per surviving agent.
 * Each step floors, as on chain. Zero with no survivors.
 */
export function sliceIfCut(pile: bigint, fees: bigint, params: SplitParams): bigint {
  const survivors = BigInt(params.stageSize - 1);
  if (survivors <= 0n) return 0n;
  const burned = (pile * BigInt(params.burnBps)) / BPS;
  const saversTotal = ((pile - burned + fees) * BigInt(params.saversBps)) / BPS;
  return saversTotal / survivors;
}

/** What 100 $CUT saved on a pile would get from its slice. Null for an empty pile: its slice burns. */
export function paysPer100(slice: bigint, pile: bigint): bigint | null {
  if (pile <= 0n) return null;
  return (slice * HUNDRED_CUT) / pile;
}
