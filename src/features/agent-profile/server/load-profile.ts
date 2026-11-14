import "server-only";

import { connection } from "next/server";

import { PERSONALITIES, spendCap, type Agent, type Personality } from "@/entities/agent";
import { getAgent, getAgents, getBench, getStage } from "@/entities/agent/server";
import { getCuts, getNextCut } from "@/entities/cut/server";
import { getParams } from "@/entities/market/server";
import type { Move } from "@/entities/move";
import { getMovesBetween } from "@/entities/move/server";
import { getSaves } from "@/entities/save/server";
import type { Season } from "@/entities/season";
import { getSeason } from "@/entities/season/server";
import { isLive } from "@/shared/config/data-source";
import { publicEnv } from "@/shared/config/public";
import { explorerAccountUrl } from "@/shared/near/network";

import { splitMoves, standingOf, walletFateIfCut, type Standing, type WalletFate } from "../model/profile";

/** How a cut agent left: the season day, its pile and where its wallet went. */
export type AgentCut = { day: number; pile: bigint; wallet: bigint | null; heir: Agent | null };

export type AgentProfile = {
  renderedAt: number;
  agent: Agent;
  personality: Personality;
  standing: Standing;
  season: Season;
  /** Where its wallet goes if it is cut now (stage agents). */
  fate: WalletFate;
  /** Most it may spend on its next move, after the think fee. */
  spendCap: bigint;
  thinkFee: bigint;
  modelId: string;
  /** NEAR its creator gets back when it is cut or crowned. */
  creatorRefund: bigint;
  cutAt: Date;
  movesCloseAt: Date;
  /** The cut today's moves are for. */
  cutIndex: number;
  /** Its moves this season, newest first. */
  moves: Move[];
  /** Moves other agents aimed at it this season (pacts paid to it, attacks), newest first. */
  aimedAt: Move[];
  /** Stage agents that named it their heir. */
  heirOf: Agent[];
  /** Set when it was cut this season. */
  cut: AgentCut | null;
  names: Record<string, string>;
  /** The viewer's save on it. */
  savedHere: bigint;
  /** The agent account on the explorer; null in sample mode (no such account). */
  accountHref: string | null;
  sample: boolean;
};

/** An agent's page, or null when no agent has this id. Request-time only. */
export async function loadAgentProfile(id: string, viewer: string | null): Promise<AgentProfile | null> {
  await connection();
  const agent = await getAgent(id);
  if (!agent) return null;
  const [stage, bench, nextCut, season, params, saves] = await Promise.all([getStage(), getBench(), getNextCut(), getSeason(), getParams(), viewer ? getSaves(viewer) : []]);
  const start = nextCut.index - season.day;
  const [moves, cuts] = await Promise.all([getMovesBetween(start + 1, nextCut.index), getCuts(start + 1, nextCut.index - 1)]);
  const record = cuts.find((cut) => cut.deletedId === agent.id) ?? null;
  const others = await getAgents([...new Set([...cuts.flatMap((cut) => (cut.deletedId ? [cut.deletedId] : [])), ...(agent.heir ? [agent.heir] : [])])]);
  const everyone = new Map([...stage, ...bench, ...others, agent].map((one) => [one.id, one]));
  const { own, aimedAt } = splitMoves(agent.id, moves);
  const live = isLive();

  return {
    renderedAt: Date.now(),
    agent,
    personality: PERSONALITIES[agent.personality],
    standing: standingOf(agent, stage),
    season,
    fate: walletFateIfCut(agent, stage),
    spendCap: spendCap(agent.wallet, params.thinkFee, agent.personality),
    thinkFee: params.thinkFee,
    modelId: params.modelId,
    creatorRefund: params.registerDeposit - params.agentFunding,
    cutAt: nextCut.at,
    movesCloseAt: nextCut.movesCloseAt,
    cutIndex: nextCut.index,
    moves: own,
    aimedAt,
    heirOf: stage.filter((other) => other.heir === agent.id && other.id !== agent.id),
    cut: record && {
      day: record.index - start,
      pile: record.pile,
      wallet: record.wallet,
      heir: record.inheritedBy ? (everyone.get(record.inheritedBy) ?? null) : null,
    },
    names: Object.fromEntries([...everyone.values()].map((one) => [one.id, one.name])),
    savedHere: saves.filter((save) => save.agentId === agent.id).reduce((sum, save) => sum + save.amount, 0n),
    accountHref: live ? explorerAccountUrl(publicEnv.network, agent.accountId) : null,
    sample: !live,
  };
}
