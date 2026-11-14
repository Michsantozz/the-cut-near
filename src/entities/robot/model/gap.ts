import { units } from "@/shared/lib/amount";

import type { Robot } from "./types";

const ONE_CUT = units(1);

/**
 * $CUT `robot` must add to rank above `other`. Zero when it already does.
 * Only a strictly older robot wins a tie; otherwise it needs one whole $CUT more than the difference.
 * Matches `get_next_cut().gap_to_next`.
 */
export function gapToPass(robot: Robot, other: Robot): bigint {
  const diff = other.pile - robot.pile;
  const winsTie = robot.joinedAt.getTime() < other.joinedAt.getTime();
  if (diff < 0n || (diff === 0n && winsTie)) return 0n;
  return winsTie ? diff : diff + ONE_CUT;
}

/** Width of a pile bar as a percent of the top pile, never thinner than `min`. */
export function barPercent(pile: bigint, topPile: bigint, min = 3): number {
  if (topPile <= 0n) return min;
  const percent = Number((pile * 100n) / topPile);
  return Math.min(100, Math.max(min, percent));
}
