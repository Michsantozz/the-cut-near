import type { Agent } from "./types";

/**
 * Higher pile first. Tie on pile: the newer agent is lower, because the contract cuts the newer one.
 * Same pile and same age: by id, only so the order on screen stays stable.
 */
export function compareAgents(a: Agent, b: Agent): number {
  if (a.pile !== b.pile) return a.pile > b.pile ? -1 : 1;
  const age = a.joinedAt.getTime() - b.joinedAt.getTime();
  if (age !== 0) return age;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The stage ranked by pile, highest first; the last agent is the one the cut takes. */
export function rankByPile(stage: readonly Agent[]): Agent[] {
  return [...stage].sort(compareAgents);
}
