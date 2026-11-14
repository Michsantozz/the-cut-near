import type { Agent } from "./types";

/**
 * Higher score first (score = pile - boos - damage). Tie on score: the newer agent is lower, because the contract
 * cuts the newer one. Same score and same age: by id, only so the order on screen stays stable.
 */
export function compareAgents(a: Agent, b: Agent): number {
  if (a.score !== b.score) return a.score > b.score ? -1 : 1;
  const age = a.joinedAt.getTime() - b.joinedAt.getTime();
  if (age !== 0) return age;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The stage ranked by score, highest first; the last agent is the one the cut takes. */
export function rankByScore(stage: readonly Agent[]): Agent[] {
  return [...stage].sort(compareAgents);
}

/** Bench queues and other pile-only orders: higher pile first, ties as `compareAgents`. */
export function compareByPile(a: Agent, b: Agent): number {
  if (a.pile !== b.pile) return a.pile > b.pile ? -1 : 1;
  return compareAgents(a, b);
}

/** Bench agents by queue, biggest first: the biggest queues take the seats when a season starts. */
export function rankByPile(agents: readonly Agent[]): Agent[] {
  return [...agents].sort(compareByPile);
}
