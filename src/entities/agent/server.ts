import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { getLiveAgent, getLiveAgents } from "./api/live";
import { SAMPLE_BENCH, SAMPLE_STAGE } from "./api/sample";
import type { Agent } from "./model/types";

// Data access for agents: the design's sample day by default, the contract (plus the journal for
// "saved today") with DATA_SOURCE=live. Live reads hit the network: render callers inside <Suspense>.

/** Stage agents, highest pile first. */
export async function getStage(): Promise<Agent[]> {
  return dataSource() === "live" ? getLiveAgents("stage") : SAMPLE_STAGE;
}

/** Bench agents, biggest queue first. */
export async function getBench(): Promise<Agent[]> {
  return dataSource() === "live" ? getLiveAgents("bench") : SAMPLE_BENCH;
}

export async function getAgent(id: string): Promise<Agent | null> {
  if (dataSource() === "live") return getLiveAgent(id);
  return [...SAMPLE_STAGE, ...SAMPLE_BENCH].find((agent) => agent.id === id) ?? null;
}
