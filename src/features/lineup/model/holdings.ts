import type { Pool } from "@/entities/market";
import type { Agent } from "@/entities/agent";
import type { Save } from "@/entities/save";
import { CUT_DECIMALS, NEAR_DECIMALS } from "@/shared/lib/amount";

// What a member holds: its $CUT valued at the pool's spot price, and what it saved on whom.

const ONE_CUT = 10n ** BigInt(CUT_DECIMALS);
const ONE_NEAR = 10n ** BigInt(NEAR_DECIMALS);

/** Spot price of 1 $CUT in yoctoNEAR, from the pool reserves. */
export function cutPriceInYoctoNear(pool: Pick<Pool, "nearReserve" | "cutReserve">): bigint {
  if (pool.cutReserve <= 0n) return 0n;
  return (pool.nearReserve * ONE_CUT) / pool.cutReserve;
}

/** Value of a $CUT balance in US cents at the pool's spot price, rounded half up. */
export function valueInUsdCents(balance: bigint, pool: Pick<Pool, "nearReserve" | "cutReserve">, usdCentsPerNear: bigint): bigint {
  if (pool.cutReserve <= 0n) return 0n;
  const numerator = balance * pool.nearReserve * usdCentsPerNear;
  const denominator = pool.cutReserve * ONE_NEAR;
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export type SavedOn = { agentId: string; agentName: string; amount: bigint };

/** A member's saves with agent names, biggest first, and their total. Unknown agents keep their id as the name. */
export function summarizeSaves(saves: readonly Save[], agents: readonly Agent[]): { items: SavedOn[]; total: bigint } {
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  const items = saves
    .filter((save) => save.amount > 0n)
    .map((save) => ({ agentId: save.agentId, agentName: names.get(save.agentId) ?? save.agentId, amount: save.amount }))
    .sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));
  return { items, total: items.reduce((sum, item) => sum + item.amount, 0n) };
}
