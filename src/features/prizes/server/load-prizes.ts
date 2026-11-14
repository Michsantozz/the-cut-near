import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import { getJournal } from "@/entities/journal/server";
import { getParams, getPool, getUsdCentsPerNear } from "@/entities/market/server";
import { rankByPile, type Agent } from "@/entities/agent";
import { getBench, getStage } from "@/entities/agent/server";
import { getClaimable, getSaves, isStorageRegistered } from "@/entities/save/server";
import { publicEnv } from "@/shared/config/public";
import { explorerTxUrl } from "@/shared/near/network";

import { latestBreakdown, type Breakdown } from "../model/breakdown";

const ONE_CUT = 10n ** 18n;
const ONE_NEAR = 10n ** 24n;

export type PastPrize = { key: string; at: Date; amount: bigint; href: string };

/** An agent's pile on the stage now, highest first; the last one is the lowest. */
export type Pile = { id: string; name: string; pile: bigint };

/** What anyone sees before saving: the next cut and the piles now. */
export type PrizesPreview = {
  renderedAt: number;
  nextCut: { index: number; at: Date; lowestName: string | null };
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
  saved: { total: bigint; agentId: string | null; agentName: string | null };
  registered: boolean;
  /** Claims already collected, newest first. */
  past: PastPrize[];
};

/** The viewer's prizes: ready to collect, how the last one was made, and past slices. Request-time only. */
export async function loadPrizes(accountId: string): Promise<Prizes> {
  await connection();
  const [claimable, saves, registered, cuts, prizes, claims, nextCut, params, pool, usd, stage, bench, registers] = await Promise.all([
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
  ]);
  const names: Record<string, string> = {};
  for (const entry of registers.entries) if (entry.agentId && typeof entry.data.name === "string") names[entry.agentId] = entry.data.name;
  for (const agent of [...stage, ...bench]) names[agent.id] = agent.name;

  const breakdown = latestBreakdown(cuts.entries, prizes.entries, saves, params.saversBps);
  const latestCut = cuts.entries.reduce((max, entry) => Math.max(max, entry.cutIndex ?? 0), 0);
  const alive = new Set([...stage, ...bench].map((agent) => agent.id));
  // A save can be taken back once the cut it was locked for has run, on an agent that is still there.
  const unlocked = saves.filter((save) => save.amount > 0n && save.lockedForCut <= latestCut && alive.has(save.agentId));
  const keepSave = breakdown ? unlocked.find((save) => save.agentId === breakdown.agentId) : unlocked[0];
  const biggest = [...saves].sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1))[0];
  const collected = claims.entries.reduce((sum, entry) => sum + (entry.amount ?? 0n), 0n);
  const priceYocto = pool.cutReserve > 0n ? (pool.nearReserve * ONE_CUT) / pool.cutReserve : 0n;

  return {
    ...preview(nextCut, stage),
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
      agentId: biggest?.agentId ?? null,
      agentName: biggest ? (names[biggest.agentId] ?? biggest.agentId) : null,
    },
    registered,
    past: claims.entries.map((entry) => ({ key: entry.id, at: entry.at, amount: entry.amount ?? 0n, href: explorerTxUrl(publicEnv.network, entry.txHash) })),
  };
}

/** A visitor's prizes page: no account, only the next cut and the piles now. Request-time only. */
export async function loadPrizesPreview(): Promise<PrizesPreview> {
  await connection();
  const [nextCut, stage] = await Promise.all([getNextCut(), getStage()]);
  return preview(nextCut, stage);
}

function preview(nextCut: { index: number; at: Date }, stage: readonly Agent[]): PrizesPreview {
  const piles = rankByPile(stage).map((agent) => ({ id: agent.id, name: agent.name, pile: agent.pile }));
  return { renderedAt: Date.now(), nextCut: { index: nextCut.index, at: nextCut.at, lowestName: piles.at(-1)?.name ?? null }, piles };
}
