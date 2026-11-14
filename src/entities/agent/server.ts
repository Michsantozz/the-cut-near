import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { cutContract } from "@/shared/near/contract";
import { getLiveAgent, getLiveAgents } from "./api/live";
import { SAMPLE_BENCH, SAMPLE_CUT, SAMPLE_STAGE } from "./api/sample";
import { PERSONALITIES, type Personality } from "./model/personality";
import type { Agent } from "./model/types";

// Data access for agents: the sample world of SPEC-v20 by default, the contract (plus the journal for
// "saved today") with DATA_SOURCE=live. Live reads hit the network: render callers inside <Suspense>.

const live = () => dataSource() === "live";

/** Stage agents, as the contract lists them (`get_stage`). Rank them with `rankByScore`. */
export async function getStage(): Promise<Agent[]> {
  return live() ? getLiveAgents("stage") : SAMPLE_STAGE;
}

/** Bench agents: the queue for the next season. */
export async function getBench(): Promise<Agent[]> {
  return live() ? getLiveAgents("bench") : SAMPLE_BENCH;
}

export async function getAgent(id: string): Promise<Agent | null> {
  if (live()) return getLiveAgent(id);
  return [...SAMPLE_STAGE, ...SAMPLE_CUT, ...SAMPLE_BENCH].find((agent) => agent.id === id) ?? null;
}

/** Several agents by id, in the same order; unknown ids are left out. For cut agents and champions. */
export async function getAgents(ids: readonly string[]): Promise<Agent[]> {
  const agents = await Promise.all(ids.map((id) => getAgent(id)));
  return agents.filter((agent): agent is Agent => agent !== null);
}

/** The personalities and their hard limits. The contract's table in live mode, the same table from code in sample. */
export async function getPersonalities(): Promise<Personality[]> {
  if (!live()) return Object.values(PERSONALITIES);
  const views = await cutContract().getPersonalities();
  return views.map((view) => ({ ...PERSONALITIES[view.id], spendBps: view.spendBps, mayAttack: view.mayAttack, mayAttackPartner: view.mayAttackPartner, promptLine: view.promptLine }));
}
