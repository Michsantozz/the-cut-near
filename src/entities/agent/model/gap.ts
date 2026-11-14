import { units } from "@/shared/lib/amount";

import { scoreShown } from "./score";
import type { Agent } from "./types";

const TENTH = units(1) / 10n;

/**
 * Score `agent` must add to rank above `other`, in $CUT units. Zero when it already does.
 * Only a strictly older agent wins a tie; a newer one needs one unit more than the difference.
 * Matches the contract's `math::gap_to_next`, behind `get_next_cut().gap_to_next`.
 */
export function gapToPass(agent: Pick<Agent, "score" | "joinedAt">, other: Pick<Agent, "score" | "joinedAt">): bigint {
  const diff = other.score - agent.score;
  const winsTie = agent.joinedAt.getTime() < other.joinedAt.getTime();
  if (diff < 0n || (diff === 0n && winsTie)) return 0n;
  return winsTie ? diff : diff + 1n;
}

/** A gap rounded up to 0.1 $CUT, so the number shown is always enough to pass: 191.4 + 1 unit → 191.5, never 191.4. */
export function tenthsToPass(gap: bigint): bigint {
  return gap <= 0n ? 0n : ((gap + TENTH - 1n) / TENTH) * TENTH;
}

/**
 * The gap every screen shows next to the two scores, in 0.1 $CUT steps. It is never less than the real gap
 * (`tenthsToPass(gapToPass(...))`), and it is also the contract's rule applied to the two scores as shown
 * (`scoreShown`), so the screen's own arithmetic checks out: Kiko 959.5 and Onyx 1,150.9 → 191.5 to pass.
 */
export function gapShown(agent: Pick<Agent, "score" | "joinedAt">, other: Pick<Agent, "score" | "joinedAt">): bigint {
  const real = tenthsToPass(gapToPass(agent, other));
  const onScreen = tenthsToPass(
    gapToPass({ score: scoreShown(agent.score), joinedAt: agent.joinedAt }, { score: scoreShown(other.score), joinedAt: other.joinedAt }),
  );
  return real > onScreen ? real : onScreen;
}

/** Width of a bar as a percent of the top value, never thinner than `min`. */
export function barPercent(value: bigint, top: bigint, min = 3): number {
  if (top <= 0n || value <= 0n) return min;
  const percent = Number((value * 100n) / top);
  return Math.min(100, Math.max(min, percent));
}
