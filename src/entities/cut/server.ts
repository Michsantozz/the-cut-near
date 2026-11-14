import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { cutContract } from "@/shared/near/contract";
import { SAMPLE_FIRST_CUT, SAMPLE_NEXT_CUT } from "./api/sample";
import { rollForward } from "./model/schedule";
import type { CutRecord, NextCut } from "./model/types";

const DAY_MS = 86_400_000;

export async function getNextCut(): Promise<NextCut> {
  if (dataSource() === "live") return cutContract().getNextCut();
  // The sample day keeps its numbers but always counts down to the coming 18:00 UTC, so it never shows "due".
  // Reads the clock: a page must reach request time (`connection()`) before calling it.
  return { ...SAMPLE_NEXT_CUT, at: rollForward(SAMPLE_NEXT_CUT.at, new Date(), DAY_MS) };
}

export async function getCut(index: number): Promise<CutRecord | null> {
  if (dataSource() === "live") return cutContract().getCut(index);
  return index === SAMPLE_FIRST_CUT.index ? SAMPLE_FIRST_CUT : null;
}
