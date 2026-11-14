import { sampleCutAt } from "@/shared/config/sample";
import { units } from "@/shared/lib/amount";
import type { CutRecord, NextCut } from "../model/types";

// The sample world's cuts (v20): cut #1 started season 1 with ten agents and cut nobody; cuts #2 to #4
// cut Kiko, Onyx and Velvet. Cut #5 is today's. Times are laid out from the coming 18:00 UTC, so the sample
// day always counts down.

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Index of today's cut in the sample world. */
export const SAMPLE_NEXT_CUT_INDEX = 5;

export function sampleNextCut(now: Date = new Date()): NextCut {
  const at = sampleCutAt(now);
  return {
    index: SAMPLE_NEXT_CUT_INDEX,
    at,
    movesCloseAt: new Date(at.getTime() - HOUR_MS),
    lowestId: "yuna",
    // Yuna (14,900) to Gremlin (15,500): Yuna is the newer agent, so she needs one $CUT more than the difference.
    gapToNext: units(601),
    prizeSoFar: units(2_180),
  };
}

const SAVERS_BPS = 9_000n;
const CREATORS_BPS = 500n;

/**
 * A past cut: half the pile burns, the rest plus the day's fees is the prize, one savers' slice per survivor.
 * `burned` is the cut's whole burn, as the contract records it: the day's attacks, half the pile and, with no
 * living heir, the cut agent's wallet.
 */
function cutRecord(index: number, deletedId: string, pile: number, fees: number, attacks: number, survivors: number, wallet: number, inheritedBy: string | null, now: Date): CutRecord {
  const pileBurned = units(pile) / 2n;
  const burned = units(attacks) + pileBurned + (inheritedBy ? 0n : units(wallet));
  const prize = units(pile) - pileBurned + units(fees);
  return {
    index,
    at: new Date(sampleCutAt(now).getTime() - (SAMPLE_NEXT_CUT_INDEX - index) * DAY_MS),
    deletedId,
    pile: units(pile),
    burned,
    prize,
    slice: (prize * SAVERS_BPS) / 10_000n / BigInt(survivors),
    creatorSlice: (prize * CREATORS_BPS) / 10_000n / BigInt(survivors),
    joinedId: null,
    inheritedBy,
    wallet: inheritedBy ? units(wallet) : null,
    championId: null,
    potPaid: 0n,
    seatedIds: [],
    runner: "keeper.thecut.sample",
  };
}

/** Every cut of the sample world so far, oldest first. */
export function sampleCuts(now: Date = new Date()): CutRecord[] {
  const start: CutRecord = {
    index: 1,
    at: new Date(sampleCutAt(now).getTime() - (SAMPLE_NEXT_CUT_INDEX - 1) * DAY_MS),
    deletedId: null,
    pile: 0n,
    burned: 0n,
    prize: 0n,
    slice: 0n,
    creatorSlice: 0n,
    joinedId: null,
    inheritedBy: null,
    wallet: null,
    championId: null,
    potPaid: 0n,
    seatedIds: ["pixie", "oracle", "mabel", "melody", "lila", "gremlin", "yuna", "velvet", "onyx", "kiko"],
    runner: "keeper.thecut.sample",
  };
  return [
    start,
    cutRecord(2, "kiko", 6_100, 1_240, 600, 9, 412, "melody", now),
    cutRecord(3, "onyx", 8_900, 1_610, 1_300, 8, 2_310, null, now),
    cutRecord(4, "velvet", 11_400, 1_930, 700, 7, 760, "lila", now),
  ];
}
