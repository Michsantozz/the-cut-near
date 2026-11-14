import { paysPer100, sliceIfCut, type SplitParams } from "@/entities/cut";
import { rankByScore, type Agent } from "@/entities/agent";
import { NEAR_DECIMALS, units } from "@/shared/lib/amount";

// The "Save an agent" picker: every stage agent ranked by score, with what it pays per 100 $CUT saved if the cut
// ran now, and what one save would get from its agent's slice of the day prize.

export type SaveChoice = {
  agent: Agent;
  /** 1 = top score. */
  rank: number;
  /** The agent the cut takes if nothing moves: its savers get nothing. */
  isLowest: boolean;
  paysPer100: bigint | null;
};

export type SavePicker = { choices: SaveChoice[]; slice: bigint; stageSize: number };

/** Stage agents by score with their pays per 100, using the fees so far (the lowest score is the one cut). */
export function buildPicker(stage: readonly Agent[], feesSoFar: bigint, params: SplitParams): SavePicker {
  const ranked = rankByScore(stage);
  const lowest = ranked.at(-1) ?? null;
  const slice = lowest ? sliceIfCut(lowest.pile, feesSoFar, params) : 0n;
  return {
    slice,
    stageSize: ranked.length,
    choices: ranked.map((agent, index) => ({
      agent,
      rank: index + 1,
      isLowest: agent === lowest,
      paysPer100: agent === lowest ? null : paysPer100(slice, agent.pile),
    })),
  };
}

/**
 * What `amount` saved on an agent would get if the cut ran now: its share of the agent's slice once the save is in
 * the pile. Null when that agent is the one cut (or nothing is saved).
 */
export function shareIfCutNow(choice: Pick<SaveChoice, "agent" | "isLowest">, slice: bigint, amount: bigint): bigint | null {
  if (choice.isLowest || amount <= 0n) return null;
  return (slice * amount) / (choice.agent.pile + amount);
}

/**
 * Widths (percent) of the picker's score bars: each score against the highest one on show, so the bars read in the
 * same order as the list. Every row keeps a 4% sliver; a score at or below zero gets only the sliver.
 */
export function scoreBarWidths(scores: readonly bigint[]): number[] {
  const top = scores.reduce((max, score) => (score > max ? score : max), 0n);
  return scores.map((score) => (top > 0n && score > 0n ? Math.max(4, Math.min(100, Number((score * 100n) / top))) : 4));
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

/**
 * Adding to a save moves its lock to the next cut (the contract's `save` sets `locked_for` again), so on an unlocked
 * save the new $CUT relocks all of it. The whole save after the add when that happens, else null.
 */
export function relockedTotal(held: { amount: bigint; unlocked: boolean } | null, amount: bigint | null): bigint | null {
  if (!held?.unlocked || amount === null || amount <= 0n) return null;
  return held.amount + amount;
}
