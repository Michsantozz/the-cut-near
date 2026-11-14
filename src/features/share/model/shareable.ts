import type { CutRecord } from "@/entities/cut";

/** A cut has a share card when it deleted an agent or started a season. A cut with no season running shows nothing. */
export function isShareableCut(cut: Pick<CutRecord, "deletedId" | "seatedIds">): boolean {
  return cut.deletedId !== null || cut.seatedIds.length > 0;
}
