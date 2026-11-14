import { gapToPass, rankByScore, type Agent } from "@/entities/agent";
import type { Move } from "@/entities/move";

// An agent's page (RULES.md): where it stands by score, what happens to its wallet if it is cut, and the moves
// it made and took.

export type Standing =
  | { place: "stage"; rank: number; of: number; isLowest: boolean; /** Score it needs to pass the agent above, when it is on the cut line. */ gap: bigint | null; above: Agent | null }
  | { place: "bench" }
  | { place: "deleted" }
  | { place: "champion" };

export function standingOf(agent: Agent, stage: readonly Agent[]): Standing {
  if (agent.status === "bench") return { place: "bench" };
  if (agent.status === "deleted") return { place: "deleted" };
  if (agent.status === "champion") return { place: "champion" };
  const ranked = rankByScore(stage);
  const index = ranked.findIndex((other) => other.id === agent.id);
  if (index < 0) return { place: "deleted" };
  const isLowest = index === ranked.length - 1 && ranked.length > 1;
  const above = isLowest ? ranked[index - 1] : null;
  return { place: "stage", rank: index + 1, of: ranked.length, isLowest, gap: above ? gapToPass(agent, above) : null, above };
}

/** Where the wallet goes if the agent is cut now: to a living heir on the stage, else it burns. */
export type WalletFate = { kind: "heir"; heir: Agent } | { kind: "burn"; why: "no-heir" | "heir-gone" };

export function walletFateIfCut(agent: Agent, stage: readonly Agent[]): WalletFate {
  if (!agent.heir) return { kind: "burn", why: "no-heir" };
  const heir = stage.find((other) => other.id === agent.heir && other.id !== agent.id);
  return heir ? { kind: "heir", heir } : { kind: "burn", why: "heir-gone" };
}

/** Moves this agent made, newest cut first, and moves other agents aimed at it. */
export function splitMoves(agentId: string, moves: readonly Move[]): { own: Move[]; aimedAt: Move[] } {
  const newestFirst = [...moves].sort((a, b) => b.cutIndex - a.cutIndex || b.submittedAt.getTime() - a.submittedAt.getTime());
  return {
    own: newestFirst.filter((move) => move.agentId === agentId),
    aimedAt: newestFirst.filter((move) => move.agentId !== agentId && move.target === agentId && move.move !== "hold"),
  };
}
