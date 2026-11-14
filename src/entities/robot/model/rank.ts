import type { Robot } from "./types";

/**
 * Higher pile first. Tie on pile: the newer robot is lower, because the contract cuts the newer one.
 * Same pile and same age: by id, only so the order on screen stays stable.
 */
export function compareRobots(a: Robot, b: Robot): number {
  if (a.pile !== b.pile) return a.pile > b.pile ? -1 : 1;
  const age = a.joinedAt.getTime() - b.joinedAt.getTime();
  if (age !== 0) return age;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The stage ranked by pile, highest first; the last robot is the one the cut takes. */
export function rankByPile(stage: readonly Robot[]): Robot[] {
  return [...stage].sort(compareRobots);
}
