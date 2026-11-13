import { units } from "@/shared/lib/amount";
import type { CutRecord, NextCut } from "../model/types";

/** Sample "now" of the design: Fri Nov 13 2026, 13:48 UTC, 4h 12m before the first cut. */
export const SAMPLE_NOW = new Date("2026-11-13T13:48:00Z");

export const SAMPLE_NEXT_CUT: NextCut = {
  index: 1,
  at: new Date("2026-11-13T18:00:00Z"),
  lowestId: "kiko",
  gapToNext: units(38_201),
  prizeSoFar: units(4_100),
};

/** The sample cut as it runs at 18:00 (SPEC-v19 §2). Slice and creator slice are rounded to 0.1 $CUT. */
export const SAMPLE_FIRST_CUT: CutRecord = {
  index: 1,
  at: new Date("2026-11-13T18:00:00Z"),
  deletedId: "kiko",
  pile: units(23_600),
  burned: units(11_800),
  prize: units(16_820),
  slice: units(17_754) / 10n,
  creatorSlice: units(934) / 10n,
  joinedId: "chartwise",
  runner: "bob.near",
};
