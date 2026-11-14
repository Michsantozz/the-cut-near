import "server-only";
import { getDb } from "@/shared/db/client";
import { startOfUtcDay } from "@/shared/lib/time";
import { cutContract } from "@/shared/near/contract";
import { savedSince } from "@/shared/near/journal";
import type { AgentView } from "@/shared/near/views";
import type { Agent } from "../model/types";

export function toAgent(view: AgentView, savedToday: bigint): Agent {
  return { ...view, savedToday };
}

/**
 * $CUT saved on each agent since midnight UTC, from the journal. The chain stays the source of
 * truth for piles: if the journal is unreachable, "Today" reads 0 instead of failing the lineup.
 */
async function savedToday(now: Date): Promise<Map<string, bigint>> {
  try {
    return await savedSince(getDb(), startOfUtcDay(now));
  } catch (error) {
    console.error("[agent] journal unavailable, showing 0 saved today", error);
    return new Map();
  }
}

export async function getLiveAgents(which: "stage" | "bench", now: Date = new Date()): Promise<Agent[]> {
  const contract = cutContract();
  const [views, saved] = await Promise.all([which === "stage" ? contract.getStage() : contract.getBench(), savedToday(now)]);
  return views.map((view) => toAgent(view, saved.get(view.id) ?? 0n));
}

export async function getLiveAgent(id: string, now: Date = new Date()): Promise<Agent | null> {
  const [view, saved] = await Promise.all([cutContract().getAgent(id), savedToday(now)]);
  return view ? toAgent(view, saved.get(view.id) ?? 0n) : null;
}
