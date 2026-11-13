import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { cutContract } from "@/shared/near/contract";
import { SAMPLE_FIRST_CUT, SAMPLE_NEXT_CUT } from "./api/sample";
import type { CutRecord, NextCut } from "./model/types";

export async function getNextCut(): Promise<NextCut> {
  return dataSource() === "live" ? cutContract().getNextCut() : SAMPLE_NEXT_CUT;
}

export async function getCut(index: number): Promise<CutRecord | null> {
  if (dataSource() === "live") return cutContract().getCut(index);
  return index === SAMPLE_FIRST_CUT.index ? SAMPLE_FIRST_CUT : null;
}
