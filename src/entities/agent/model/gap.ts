import { units } from "@/shared/lib/amount";

import type { Agent } from "./types";

const ONE_CUT = units(1);

/**
 * Score `agent` must add to rank above `other`, in $CUT units. Zero when it already does.
 * Only a strictly older agent wins a tie; a newer one needs one unit more than the difference.
 * Matches the contract's `math::gap_to_next`, behind `get_next_cut().gap_to_next`.
 */
export function gapToPass(agent: Agent, other: Agent): bigint {
  const diff = other.score - agent.score;
  const winsTie = agent.joinedAt.getTime() < other.joinedAt.getTime();
  if (diff < 0n || (diff === 0n && winsTie)) return 0n;
  return winsTie ? diff : diff + 1n;
}

/** A gap rounded up to whole $CUT, so the number shown is always enough to pass: 191.4 → 192, never 191. */
export function wholeCutsToPass(gap: bigint): bigint {
  return ((gap + ONE_CUT - 1n) / ONE_CUT) * ONE_CUT;
}

/** Width of a bar as a percent of the top value, never thinner than `min`. */
export function barPercent(value: bigint, top: bigint, min = 3): number {
  if (top <= 0n || value <= 0n) return min;
  const percent = Number((value * 100n) / top);
  return Math.min(100, Math.max(min, percent));
}
