import { paysPer100, sliceIfCut, type SplitParams } from "@/entities/cut";
import { rankByPile, type Robot } from "@/entities/robot";
import { NEAR_DECIMALS, units } from "@/shared/lib/amount";

// The "Save a robot" picker: every stage robot with what it pays per 100 $CUT saved if the cut ran now
// (SPEC-v19 §2), and what one save would get from its robot's slice.

export type SaveChoice = {
  robot: Robot;
  /** 1 = top pile. */
  rank: number;
  /** The robot the cut takes if nothing moves: its savers get nothing. */
  isLowest: boolean;
  paysPer100: bigint | null;
};

export type SavePicker = { choices: SaveChoice[]; slice: bigint; stageSize: number };

/** Stage robots by pile with their pays per 100, using the fees so far (the same numbers as the lineup). */
export function buildPicker(stage: readonly Robot[], feesSoFar: bigint, params: SplitParams): SavePicker {
  const ranked = rankByPile(stage);
  const lowest = ranked.at(-1) ?? null;
  const slice = lowest ? sliceIfCut(lowest.pile, feesSoFar, params) : 0n;
  return {
    slice,
    stageSize: ranked.length,
    choices: ranked.map((robot, index) => ({
      robot,
      rank: index + 1,
      isLowest: robot === lowest,
      paysPer100: robot === lowest ? null : paysPer100(slice, robot.pile),
    })),
  };
}

/**
 * What `amount` saved on a robot would get if the cut ran now: its share of the robot's slice once the save is in
 * the pile. Null when that robot is the one cut (or nothing is saved).
 */
export function shareIfCutNow(choice: Pick<SaveChoice, "robot" | "isLowest">, slice: bigint, amount: bigint): bigint | null {
  if (choice.isLowest || amount <= 0n) return null;
  return (slice * amount) / (choice.robot.pile + amount);
}

/** "5th of 10". */
export function ordinal(rank: number): string {
  const tens = rank % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[rank % 10] ?? "th";
  return `${rank}${suffix}`;
}

/** Smallest new save the contract takes (`MIN_SAVE`): 0.1 $CUT. */
export const MIN_SAVE = units(1) / 10n;

/** The amount the save screen opens with: 100 $CUT, or all the free $CUT when there is less. */
export function defaultSave(free: bigint): bigint {
  return free < units(100) ? free : units(100);
}

/** Why a save amount cannot be sent yet, or null when it can. */
export function saveProblem(amount: bigint | null, free: bigint, hasSave: boolean): "empty" | "too-small" | "too-much" | null {
  if (amount === null || amount <= 0n) return "empty";
  if (amount > free) return "too-much";
  if (!hasSave && amount < MIN_SAVE) return "too-small";
  return null;
}

/** NEAR attached to a save when the account's storage balance runs thin (see `storageTopUp`). */
export const SAVE_STORAGE = { enough: units(3, NEAR_DECIMALS) / 1000n, topUp: units(5, NEAR_DECIMALS) / 1000n };
