import type { Agent } from "@/entities/agent";
import type { Save } from "@/entities/save";

// What a member holds: its $CUT valued at the pool's spot price, and what it saved on whom.

export { cutPriceInYoctoNear, valueInUsdCents } from "@/entities/market";

/** `lockedForCut` is the cut the save is locked for: once that cut has run, the save is unlocked. */
export type SavedOn = { agentId: string; agentName: string; amount: bigint; lockedForCut: number };

/** A member's saves with agent names, biggest first, and their total. Unknown agents keep their id as the name. */
export function summarizeSaves(saves: readonly Save[], agents: readonly Agent[]): { items: SavedOn[]; total: bigint } {
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  const items = saves
    .filter((save) => save.amount > 0n)
    .map((save) => ({ agentId: save.agentId, agentName: names.get(save.agentId) ?? save.agentId, amount: save.amount, lockedForCut: save.lockedForCut }))
    .sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1));
  return { items, total: items.reduce((sum, item) => sum + item.amount, 0n) };
}

/**
 * How much of the saves is still locked for the next cut (`nextCutIndex`) and how much a past cut unlocked, the way
 * `get_saves` counts `unlocked`: a save is unlocked once the cut it was locked for has run.
 */
export function splitByLock(saves: readonly Pick<SavedOn, "amount" | "lockedForCut">[], nextCutIndex: number): { locked: bigint; unlocked: bigint } {
  let locked = 0n;
  let unlocked = 0n;
  for (const save of saves) {
    if (save.lockedForCut < nextCutIndex) unlocked += save.amount;
    else locked += save.amount;
  }
  return { locked, unlocked };
}
