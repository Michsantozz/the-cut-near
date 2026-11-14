import "server-only";

import { connection } from "next/server";

import { isDeletingCut, paysPer100, sliceIfCut, type CutRecord, type DeletingCut } from "@/entities/cut";
import { getCut, getNextCut } from "@/entities/cut/server";
import type { Params } from "@/entities/market";
import { getParams, getTotalSupply } from "@/entities/market/server";
import { rankByPile, type Agent } from "@/entities/agent";
import { getBench, getStage } from "@/entities/agent/server";

export type LivePile = { agent: Agent; isLowest: boolean; paysPer100: bigint | null };

export type PastCut = DeletingCut & { deletedName: string; joinedName: string | null };

export type Inside = {
  /** Request time in ms: when the piles were read. */
  renderedAt: number;
  cutAt: Date;
  cutIndex: number;
  params: Params;
  piles: LivePile[];
  lowest: Agent | null;
  next: Agent | null;
  gap: bigint;
  fees: bigint;
  /** If the cut ran now: what burns, the prize, one savers' slice, one creators' slice. */
  burn: bigint;
  prize: bigint;
  slice: bigint;
  creatorSlice: bigint;
  bench: Agent[];
  /** $CUT burned since launch: minted supply minus what exists now. */
  burned: bigint;
  /** Cuts that already ran, newest first (the latest 30). */
  pastCuts: PastCut[];
};

const BPS = 10_000n;
const PAST_CUTS = 30;

/** Everything "Inside the cut" shows: live piles, why the lowest is cut, the fixed rules and every past cut. */
export async function loadInside(): Promise<Inside> {
  await connection();
  const [stage, bench, nextCut, params, supply] = await Promise.all([getStage(), getBench(), getNextCut(), getParams(), getTotalSupply()]);
  const ranked = rankByPile(stage);
  const lowest = ranked.find((agent) => agent.id === nextCut.lowestId) ?? ranked.at(-1) ?? null;
  const next = lowest ? (ranked[ranked.indexOf(lowest) - 1] ?? null) : null;
  const slice = lowest ? sliceIfCut(lowest.pile, nextCut.prizeSoFar, params) : 0n;
  const burn = lowest ? (lowest.pile * BigInt(params.burnBps)) / BPS : 0n;
  const prize = lowest ? lowest.pile - burn + nextCut.prizeSoFar : 0n;
  const survivors = BigInt(Math.max(params.stageSize - 1, 1));

  const indexes = Array.from({ length: Math.min(nextCut.index - 1, PAST_CUTS) }, (_, i) => nextCut.index - 1 - i);
  const records = (await Promise.all(indexes.map((index) => getCut(index)))).filter((cut): cut is CutRecord => cut !== null);
  const agents = [...stage, ...bench];
  const nameOf = (id: string) => agents.find((agent) => agent.id === id)?.name ?? id;

  return {
    renderedAt: Date.now(),
    cutAt: nextCut.at,
    cutIndex: nextCut.index,
    params,
    piles: ranked.map((agent) => ({ agent, isLowest: agent === lowest, paysPer100: agent === lowest ? null : paysPer100(slice, agent.pile) })),
    lowest,
    next,
    gap: nextCut.gapToNext,
    fees: nextCut.prizeSoFar,
    burn,
    prize,
    slice,
    creatorSlice: (prize - (prize * BigInt(params.saversBps)) / BPS) / survivors,
    bench: rankByPile(bench),
    burned: params.totalSupply - supply,
    pastCuts: records.filter(isDeletingCut).map((cut) => ({ ...cut, deletedName: nameOf(cut.deletedId), joinedName: cut.joinedId ? nameOf(cut.joinedId) : null })),
  };
}
