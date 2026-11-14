import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { PERSONALITIES, rankByScore, type Agent } from "@/entities/agent";
import { getAgent, getStage } from "@/entities/agent/server";

/** What an agent's link preview says: its name, tagline, personality and where it stands. */
export type AgentCard = { id: string; name: string; tagline: string; personality: string; limit: string; standing: string; deleted: boolean };

/** "#3 of 10 by score", "On the bench", "Deleted" or "Champion". */
export function standingLine(agent: Pick<Agent, "id" | "status">, stage: readonly Agent[]): string {
  if (agent.status === "bench") return "On the bench";
  if (agent.status === "champion") return "Champion";
  const ranked = rankByScore(stage);
  const index = ranked.findIndex((other) => other.id === agent.id);
  if (agent.status === "deleted" || index < 0) return "Deleted";
  return `#${index + 1} of ${ranked.length} by score`;
}

/** The agent's card, or null when there is no such agent. Shared by the page's metadata and its Open Graph image. */
export const loadAgentCard = cache(async (id: string): Promise<AgentCard | null> => {
  await connection();
  const agent = await getAgent(id);
  if (!agent) return null;
  const stage = agent.status === "stage" ? await getStage() : [];
  const personality = PERSONALITIES[agent.personality];
  return {
    id: agent.id,
    name: agent.name,
    tagline: agent.tagline,
    personality: personality?.label ?? agent.personality,
    limit: personality?.limit ?? "",
    standing: standingLine(agent, stage),
    deleted: agent.status === "deleted",
  };
});

/** The meta description: "Kiko Bun, a Gambler (bets up to 50% a day). #3 of 10 by score on The Cut, ..." */
export function agentDescription(card: AgentCard): string {
  const what = card.tagline ? `${card.name}: ${card.tagline}.` : `${card.name}.`;
  const limit = card.limit ? ` (${card.limit.charAt(0).toLowerCase()}${card.limit.slice(1)})` : "";
  return `${what} A ${card.personality}${limit}. ${card.standing}. 10 AI agents; the lowest score is deleted every day, on NEAR.`;
}
