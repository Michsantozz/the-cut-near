import type { Agent } from "@/entities/agent";

// The season (RULES.md "Agent lifecycle"): a stage that shrinks by one agent a day until one is left and crowned.

/** One seat of the season's stage: still alive, cut on a day, or the crowned champion. */
export type Seat = { agent: Agent; state: "alive" | "champion" } | { agent: Agent; state: "cut"; day: number };

/** Alive seats by score first (as given), then the cut ones, most recent cut first. */
export function seats(alive: readonly Agent[], cut: readonly { agent: Agent; day: number }[], championId: string | null): Seat[] {
  return [
    ...alive.map((agent): Seat => ({ agent, state: agent.id === championId ? "champion" : "alive" })),
    ...[...cut].sort((a, b) => b.day - a.day).map((entry): Seat => ({ agent: entry.agent, state: "cut", day: entry.day })),
  ];
}

/** What the champion's savers get from the pot: at most 1 $CUT per $CUT saved, so at most its pile. The rest carries. */
export function potPayout(pot: bigint, championPile: bigint): { paid: bigint; carried: bigint } {
  const paid = pot < championPile ? pot : championPile;
  return { paid, carried: pot - paid };
}

/** Bench agents that take a seat when the next season starts: the biggest queues, up to the stage size. */
export function nextSeated(bench: readonly Agent[], stageSize: number): Set<string> {
  return new Set(bench.slice(0, stageSize).map((agent) => agent.id));
}
