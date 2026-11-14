"use server";

import { getAgent } from "@/entities/agent/server";
import { getNearBalance } from "@/entities/market/server";
import { publicEnv } from "@/shared/config/public";
import { isAccountId } from "@/shared/lib/account-id";

import { agentIdError } from "../model/agent-form";

export type AgentIdStatus = "free" | "taken" | "invalid";

/** Whether `<id>.<contract>` can still be created: ids of deleted agents are never reused, so any known agent takes it. */
export async function checkAgentId(id: string): Promise<AgentIdStatus> {
  if (typeof id !== "string" || agentIdError(id, publicEnv.contractId)) return "invalid";
  return (await getAgent(id)) ? "taken" : "free";
}

/** The account's NEAR balance in yoctoNEAR (a decimal string), to check the deposit before the wallet opens. */
export async function checkNearBalance(accountId: string): Promise<string | null> {
  if (typeof accountId !== "string" || !isAccountId(accountId)) return null;
  const balance = await getNearBalance(accountId);
  return balance === null ? null : balance.toString();
}
