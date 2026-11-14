"use server";

import { getAgent } from "@/entities/agent/server";
import { publicEnv } from "@/shared/config/public";

import { agentIdError } from "../model/agent-form";

export type AgentIdStatus = "free" | "taken" | "invalid";

/** Whether `<id>.<contract>` can still be created: ids of deleted agents are never reused, so any known agent takes it. */
export async function checkAgentId(id: string): Promise<AgentIdStatus> {
  if (typeof id !== "string" || agentIdError(id, publicEnv.contractId)) return "invalid";
  return (await getAgent(id)) ? "taken" : "free";
}
