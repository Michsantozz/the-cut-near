import type { Agent } from "@/entities/agent";
import type { Save } from "@/entities/save";

// What a member holds: its $CUT valued at the pool's spot price, and what it saved on whom.

export { cutPriceInYoctoNear, valueInUsdCents } from "@/entities/market";

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
