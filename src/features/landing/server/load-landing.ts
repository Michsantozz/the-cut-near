import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import type { Params } from "@/entities/market";
import { getParams, getPool, getTotalSupply, getUsdCentsPerNear } from "@/entities/market/server";
import { rankByPile, type Agent } from "@/entities/agent";
import { getBench, getStage } from "@/entities/agent/server";
import type { Move } from "@/entities/move";
import { getMoves } from "@/entities/move/server";
import type { Season } from "@/entities/season";
import { getSeason } from "@/entities/season/server";
import { isLive } from "@/shared/config/data-source";

import { landingNumbers, type LandingNumbers } from "../model/landing";

export type Landing = LandingNumbers & {
  /** Request time in ms: the first frame of the live countdown. */
  renderedAt: number;
  cutAt: Date;
  /** Agents' moves are refused from this time on. */
  movesCloseAt: Date;
  cutIndex: number;
  season: Season;
  /** The moves already in for the coming cut, signed in NEAR AI's TEE. */
  moves: Move[];
  live: boolean;
  params: Params;
  fees: bigint;
  /** Score the lowest agent needs to pass the next one. */
  gap: bigint;
  supply: bigint;
  usdCentsPerNear: bigint | null;
  bench: Agent[];
};

/** Everything the landing shows, read like the app reads it. Request-time only (reads the clock). */
export async function loadLanding(): Promise<Landing> {
  await connection();
  const [stage, bench, nextCut, params, supply, pool, usdCentsPerNear, season] = await Promise.all([
    getStage(),
    getBench(),
    getNextCut(),
    getParams(),
    getTotalSupply(),
    getPool(),
    getUsdCentsPerNear(),
    getSeason(),
  ]);
  const moves = await getMoves(nextCut.index);
  return {
    ...landingNumbers({ stage, lowestId: nextCut.lowestId, fees: nextCut.prizeSoFar, params, supply, pool, usdCentsPerNear }),
    renderedAt: Date.now(),
    cutAt: nextCut.at,
    movesCloseAt: nextCut.movesCloseAt,
    cutIndex: nextCut.index,
    season,
    moves,
    live: isLive(),
    params,
    fees: nextCut.prizeSoFar,
    gap: nextCut.gapToNext,
    supply,
    usdCentsPerNear,
    bench: rankByPile(bench),
  };
}
