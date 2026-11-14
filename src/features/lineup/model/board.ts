import { gapToPass, rankByPile, rankByScore, type Agent } from "@/entities/agent";
import type { Move } from "@/entities/move";

// Today's cut (RULES.md "The day"): the stage ranked by score (pile - boos - damage), who is on the cut line,
// how far it is from the agent above, and each agent's move for this cut.

export type StageEntry = {
  agent: Agent;
  /** 1 = highest score. */
  rank: number;
  /** True for the agent the cut takes if nothing moves. */
  isLowest: boolean;
  /** Its signed move for this cut, or null while it has not moved. */
  move: Move | null;
};

export type Board = {
  entries: StageEntry[];
  lowest: Agent | null;
  /** The agent right above the lowest one, the one to pass. */
  next: Agent | null;
  /** Score the lowest agent needs to pass `next`. */
  gap: bigint | null;
  totalSaved: bigint;
};

export function buildBoard(stage: readonly Agent[], moves: readonly Move[]): Board {
  const ranked = rankByScore(stage);
  const lowest = ranked.at(-1) ?? null;
  const next = ranked.length > 1 ? ranked[ranked.length - 2] : null;
  const byAgent = new Map(moves.map((move) => [move.agentId, move]));
  return {
    entries: ranked.map((agent, index) => ({ agent, rank: index + 1, isLowest: agent === lowest, move: byAgent.get(agent.id) ?? null })),
    lowest,
    next,
    gap: lowest && next ? gapToPass(lowest, next) : null,
    totalSaved: ranked.reduce((sum, agent) => sum + agent.pile, 0n),
  };
}

/** Bench agents by queue, biggest first: the biggest queues take the seats when the next season starts. */
export function rankBench(bench: readonly Agent[]): Agent[] {
  return rankByPile(bench);
}

/** The cut index that started the season: day 1 runs up to the cut after it. */
export function seasonStartCut(nextCutIndex: number, day: number): number {
  return nextCutIndex - day;
}

/** The Final hour: the last hour before each cut. */
export const FINAL_HOUR_MS = 60 * 60 * 1_000;
