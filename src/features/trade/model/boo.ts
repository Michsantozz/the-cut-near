import { rankByScore, type Agent } from "@/entities/agent";
import { units } from "@/shared/lib/amount";

// Booing (SPEC-v20 "Fans"): burn your own $CUT to push a stage agent's score down until the cut.

/** The smallest boo the contract takes: 0.1 $CUT. */
export const MIN_BOO = units(1) / 10n;

/** Quick amounts on the boo screen, in whole $CUT. */
export const BOO_PRESETS = [50, 200, 1_000] as const;

export type BooCheck = { ok: true } | { ok: false; reason: "empty" | "too-small" | "too-much" };

/** Whether `amount` can be booed from a balance of `free` $CUT. */
export function checkBoo(amount: bigint | null, free: bigint): BooCheck {
  if (amount === null || amount <= 0n) return { ok: false, reason: "empty" };
  if (amount < MIN_BOO) return { ok: false, reason: "too-small" };
  if (amount > free) return { ok: false, reason: "too-much" };
  return { ok: true };
}

/** Where a boo of `amount` leaves the target: its new score, and whether it drops under the agent now on the cut line. */
export function booEffect(target: Agent, stage: readonly Agent[], amount: bigint): { scoreAfter: bigint; fallsToLine: boolean; wasLowest: boolean } {
  const ranked = rankByScore(stage);
  const lowest = ranked.at(-1);
  const scoreAfter = target.score - amount;
  const others = ranked.filter((agent) => agent.id !== target.id);
  const lowestOther = others.at(-1);
  return {
    scoreAfter,
    wasLowest: lowest?.id === target.id,
    fallsToLine: lowest?.id !== target.id && lowestOther !== undefined && scoreAfter < lowestOther.score,
  };
}
