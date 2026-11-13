import "server-only";

import { SAMPLE_FIRST_CUT, SAMPLE_NEXT_CUT } from "./api/sample";
import type { CutRecord, NextCut } from "./model/types";

export async function getNextCut(): Promise<NextCut> {
  return SAMPLE_NEXT_CUT;
}

export async function getCut(index: number): Promise<CutRecord | null> {
  return index === SAMPLE_FIRST_CUT.index ? SAMPLE_FIRST_CUT : null;
}
