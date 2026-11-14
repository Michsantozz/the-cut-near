import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import { getJournal } from "@/entities/journal/server";
import { getParams, getPool, getUsdCentsPerNear } from "@/entities/market/server";
import { rankByPile, type Agent } from "@/entities/agent";
import { getBench, getStage } from "@/entities/agent/server";
import { getClaimable, getSaves, isStorageRegistered } from "@/entities/save/server";
import { getSeason } from "@/entities/season/server";
import { publicEnv } from "@/shared/config/public";
import { explorerTxUrl } from "@/shared/near/network";

import { latestBreakdown, type Breakdown } from "../model/breakdown";

const ONE_CUT = 10n ** 18n;
const ONE_NEAR = 10n ** 24n;

export type PastPrize = { key: string; at: Date; amount: bigint; href: string };

/** An agent's pile on the stage now, highest first. */
export type Pile = { id: string; name: string; pile: bigint };

/** What anyone sees before saving: the next cut, the game's prizes so far and the piles now. */
export type PrizesPreview = {
  renderedAt: number;
  /** `prizeSoFar` is the day prize built so far for that cut (`get_next_cut`), the number the lineup shows. */
  /** `lowestId` is the lowest score, the agent the cut takes (null between seasons). */
  nextCut: { index: number; at: Date; lowestId: string | null; lowestName: string | null; prizeSoFar: bigint };
  /** $CUT in the season pot now, for the champion's savers. */
  seasonPot: bigint;
  piles: Pile[];
};

export type Prizes = PrizesPreview & {
  accountId: string;
  claimable: bigint;
  claimableUsdCents: bigint | null;
  /** Collected so far plus what is ready. */
  total: bigint;
  /** Cuts that paid this account something (collected claims count once each). */
  cutsPaid: number;
  breakdown: Breakdown | null;
  names: Record<string, string>;
  /** The save that keeps riding into the next cut unless the viewer takes it back with the collect. */
  keep: { agentId: string; agentName: string; amount: bigint } | null;
  /** Total saved now, and the agent with the biggest save, for the empty state. */
  /** All your saves; `agentName` is the biggest one, `agents` how many agents you saved on. */
  saved: { total: bigint; agents: number; agentId: string | null; agentName: string | null };
  registered: boolean;
  /** Claims already collected, newest first. */
  past: PastPrize[];
};

/** The viewer's prizes: ready to collect, how the last one was made, and past slices. Request-time only. */
export async function loadPrizes(accountId: string): Promise<Prizes> {
  await connection();
  const [claimable, saves, registered, cuts, prizes, claims, nextCut, params, pool, usd, stage, bench, registers, season] = await Promise.all([
    getClaimable(accountId),
    getSaves(accountId),
    isStorageRegistered(accountId),
    getJournal({ events: ["cut"], limit: 10 }),
    getJournal({ events: ["prize"], limit: 200 }),
    getJournal({ accountId, events: ["claim"], limit: 20 }),
    getNextCut(),
    getParams(),
    getPool(),
    getUsdCentsPerNear(),
    getStage(),
    getBench(),
    getJournal({ events: ["register"], limit: 200 }),
    getSeason(),
  ]);
  const names: Record<string, string> = {};
  for (const entry of registers.entries) if (entry.agentId && typeof entry.data.name === "string") names[entry.agentId] = entry.data.name;
  for (const agent of [...stage, ...bench]) names[agent.id] = agent.name;

  const breakdown = latestBreakdown(cuts.entries, prizes.entries, saves, params.saversBps, params.burnBps);
  const latestCut = cuts.entries.reduce((max, entry) => Math.max(max, entry.cutIndex ?? 0), 0);
  const alive = new Set([...stage, ...bench].map((agent) => agent.id));
  // A save can be taken back once the cut it was locked for has run, on an agent that is still there.
  const unlocked = saves.filter((save) => save.amount > 0n && save.lockedForCut <= latestCut && alive.has(save.agentId));
  const keepSave = breakdown ? unlocked.find((save) => save.agentId === breakdown.agentId) : unlocked[0];
  const biggest = [...saves].sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1))[0];
  const collected = claims.entries.reduce((sum, entry) => sum + (entry.amount ?? 0n), 0n);
  const priceYocto = pool.cutReserve > 0n ? (pool.nearReserve * ONE_CUT) / pool.cutReserve : 0n;

  return {
    ...preview(nextCut, stage, season.pot),
    accountId,
    claimable,
    claimableUsdCents: usd === null ? null : ((claimable * priceYocto) / ONE_CUT * usd * 2n + ONE_NEAR) / (2n * ONE_NEAR),
    total: collected + claimable,
    cutsPaid: claims.entries.length + (claimable > 0n ? 1 : 0),
    breakdown,
    names,
    keep: keepSave ? { agentId: keepSave.agentId, agentName: names[keepSave.agentId] ?? keepSave.agentId, amount: keepSave.amount } : null,
    saved: {
      total: saves.reduce((sum, save) => sum + save.amount, 0n),
      agents: new Set(saves.filter((save) => save.amount > 0n).map((save) => save.agentId)).size,
      agentId: biggest?.agentId ?? null,
      agentName: biggest ? (names[biggest.agentId] ?? biggest.agentId) : null,
    },
    registered,
    past: claims.entries.map((entry) => ({ key: entry.id, at: entry.at, amount: entry.amount ?? 0n, href: explorerTxUrl(publicEnv.network, entry.txHash) })),
  };
}

/** A visitor's prizes page: no account, only the next cut, the game's prizes so far and the piles now. Request-time only. */
export async function loadPrizesPreview(): Promise<PrizesPreview> {
  await connection();
  const [nextCut, stage, season] = await Promise.all([getNextCut(), getStage(), getSeason()]);
  return preview(nextCut, stage, season.pot);
}

function preview(nextCut: { index: number; at: Date; lowestId: string | null; prizeSoFar: bigint }, stage: readonly Agent[], seasonPot: bigint): PrizesPreview {
  const piles = rankByPile(stage).map((agent) => ({ id: agent.id, name: agent.name, pile: agent.pile }));
  // The cut takes the lowest score (pile − boos − damage), which need not be the smallest pile.
  const lowest = stage.find((agent) => agent.id === nextCut.lowestId) ?? null;
  return {
    renderedAt: Date.now(),
    nextCut: { index: nextCut.index, at: nextCut.at, lowestId: lowest?.id ?? null, lowestName: lowest?.name ?? null, prizeSoFar: nextCut.prizeSoFar },
    seasonPot,
    piles,
  };
}
