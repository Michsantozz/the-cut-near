import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { cutContract } from "@/shared/near/contract";
import { sampleMoves } from "./api/sample";
import type { Move } from "./model/types";

/** How many cuts of moves the contract keeps (RULES.md `MOVE_HISTORY`). */
export const MOVE_HISTORY = 30;

/** The moves signed for one cut, in the order they came in (`get_moves`). Reads the clock in sample mode. */
export async function getMoves(cutIndex: number): Promise<Move[]> {
  if (dataSource() === "live") return cutContract().getMoves(cutIndex);
  return sampleMoves(cutIndex);
}

/** Moves of the cuts `fromCut..=toCut`, newest cut first. The contract keeps only the last 30 cuts. */
export async function getMovesBetween(fromCut: number, toCut: number): Promise<Move[]> {
  const first = Math.max(fromCut, toCut - MOVE_HISTORY + 1, 0);
  const indexes = Array.from({ length: Math.max(toCut - first + 1, 0) }, (_, i) => toCut - i);
  const pages = await Promise.all(indexes.map((index) => getMoves(index)));
  return pages.flat();
}
