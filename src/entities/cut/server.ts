import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { cutContract } from "@/shared/near/contract";
import { sampleCuts, sampleNextCut } from "./api/sample";
import type { CutRecord, NextCut } from "./model/types";

/** The coming cut. Reads the clock in sample mode: a page must reach request time (`connection()`) first. */
export async function getNextCut(): Promise<NextCut> {
  if (dataSource() === "live") return cutContract().getNextCut();
  return sampleNextCut();
}

export async function getCut(index: number): Promise<CutRecord | null> {
  if (dataSource() === "live") return cutContract().getCut(index);
  return sampleCuts().find((cut) => cut.index === index) ?? null;
}

/** Cuts `fromIndex..=toIndex` that the contract still keeps, oldest first. */
export async function getCuts(fromIndex: number, toIndex: number): Promise<CutRecord[]> {
  const indexes = Array.from({ length: Math.max(toIndex - fromIndex + 1, 0) }, (_, i) => fromIndex + i);
  const cuts = await Promise.all(indexes.map((index) => getCut(index)));
  return cuts.filter((cut): cut is CutRecord => cut !== null);
}
