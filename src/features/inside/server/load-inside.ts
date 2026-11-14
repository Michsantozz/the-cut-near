import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import type { Params } from "@/entities/market";
import { getParams } from "@/entities/market/server";
import { isLive } from "@/shared/config/data-source";

export type Inside = {
  /** False in sample mode: the page then names no contract and links to no explorer. */
  live: boolean;
  params: Params;
  cutAt: Date;
  movesCloseAt: Date;
};

/** The rules page: the fixed parameters (`get_params`) and today's two times. Request-time only. */
export async function loadInside(): Promise<Inside> {
  await connection();
  const [params, nextCut] = await Promise.all([getParams(), getNextCut()]);
  return { live: isLive(), params, cutAt: nextCut.at, movesCloseAt: nextCut.movesCloseAt };
}
