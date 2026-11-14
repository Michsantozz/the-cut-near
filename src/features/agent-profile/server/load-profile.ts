import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import { getJournal } from "@/entities/journal/server";
import { getParams } from "@/entities/market/server";
import type { Agent } from "@/entities/agent";
import { getBench, getAgent, getStage } from "@/entities/agent/server";
import { getSaves } from "@/entities/save/server";
import { publicEnv } from "@/shared/config/public";
import { explorerAccountUrl, explorerTxUrl } from "@/shared/near/network";
import { formatUtcTime, relativeUtcDay } from "@/shared/ui/format";

import { historyLine, AGENT_EVENTS, type HistoryLine } from "../model/history";
import { bannerFor, ladder, paysFor, standingOf, type Banner, type LadderRow, type Pays, type Standing } from "../model/profile";

export type AgentCutReceipt = { index: number; at: Date; pile: bigint; burned: bigint; prize: bigint; slice: bigint; creatorSlice: bigint; runner: string; href: string };

export type AgentProfile = {
  renderedAt: number;
  agent: Agent;
  standing: Standing;
  pays: Pays | null;
  banner: Banner | null;
  ladder: LadderRow[];
  cutAt: Date;
  /** "today 18:00 UTC" for the cut line. */
  cutLabel: string;
  savedHere: bigint;
  accountHref: string;
  history: (HistoryLine & { href: string })[];
  /** Set when the agent was cut. */
  cut: AgentCutReceipt | null;
  viewer: string | null;
};

function big(data: Record<string, unknown>, key: string): bigint {
  const value = data[key];
  return typeof value === "string" && /^\d{1,39}$/.test(value) ? BigInt(value) : 0n;
}

/** An agent's page, or null when no agent has this id. Request-time only. */
export async function loadAgentProfile(id: string, viewer: string | null): Promise<AgentProfile | null> {
  await connection();
  const found = await getAgent(id);
  if (!found) return null;
  const [liveStage, bench, nextCut, params, saves, history, cuts] = await Promise.all([
    getStage(),
    getBench(),
    getNextCut(),
    getParams(),
    viewer ? getSaves(viewer) : Promise.resolve([]),
    getJournal({ agentId: id, events: AGENT_EVENTS, limit: 30 }),
    getJournal({ events: ["cut"], limit: 3 }),
  ]);
  // A cut receipt in the journal means the agent is gone, even if the stage read lags behind it.
  const gone = new Set(cuts.entries.map((entry) => entry.agentId).filter((agentId): agentId is string => agentId !== null));
  const agent = gone.has(id) && found.status !== "deleted" ? { ...found, status: "deleted" as const } : found;
  const stage = liveStage.filter((r) => !gone.has(r.id));
  const now = new Date();
  const savedHere = saves.filter((save) => save.agentId === id).reduce((sum, save) => sum + save.amount, 0n);
  const standing = standingOf(agent, stage, bench);
  const day = relativeUtcDay(now, nextCut.at);
  const cutTime = `${formatUtcTime(nextCut.at)} UTC${day ? ` ${day}` : ""}`;
  const cutEntry = agent.status === "deleted" ? history.entries.find((entry) => entry.event === "cut") : undefined;

  return {
    renderedAt: now.getTime(),
    agent,
    standing,
    pays: paysFor(agent, stage, nextCut.prizeSoFar, params, savedHere),
    banner: bannerFor(agent, standing, stage, bench, savedHere, cutTime),
    ladder: ladder(agent, stage, bench),
    cutAt: nextCut.at,
    cutLabel: `${day ? `${day.toUpperCase()} ` : ""}${formatUtcTime(nextCut.at)} UTC`,
    savedHere,
    accountHref: explorerAccountUrl(publicEnv.network, agent.accountId),
    history: history.entries
      .map((entry) => historyLine(entry, agent.name))
      .filter((line): line is HistoryLine => line !== null)
      .slice(0, 8)
      .map((line) => ({ ...line, href: explorerTxUrl(publicEnv.network, line.txHash) })),
    cut: cutEntry
      ? {
          index: cutEntry.cutIndex ?? 0,
          at: cutEntry.at,
          pile: big(cutEntry.data, "pile"),
          burned: big(cutEntry.data, "burned"),
          prize: big(cutEntry.data, "prize"),
          slice: big(cutEntry.data, "slice"),
          creatorSlice: big(cutEntry.data, "creator_slice"),
          runner: typeof cutEntry.data.runner === "string" ? cutEntry.data.runner : "",
          href: explorerTxUrl(publicEnv.network, cutEntry.txHash),
        }
      : null,
    viewer,
  };
}
