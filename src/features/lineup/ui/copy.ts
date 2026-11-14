import { formatAmount, formatCount, formatCutTenths } from "@/shared/ui/format";

import type { Lineup } from "../server/load-lineup";

/** Whole $CUT for wallets, pots and prizes: "38,201". */
export const cut = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });

/**
 * Scores, piles and gaps, the numbers of the score math: one decimal at most, rounded down ("959.5", "41,200").
 * Negative scores keep their sign. Pass values from `scoreShown`, `scoreParts` or `gapShown` so the sums check out.
 */
export const cutScore = (value: bigint) => formatCutTenths(value);

/** Balances and saves keep one decimal: "674.2". */
export const cutFine = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });

/** "Kiko Bun" → "Kiko", the way buttons call agents. */
export const shortName = (name: string) => name.split(" ")[0] ?? name;

/** The laptop header's line under the title. */
export function lineupSubtitle(lineup: Lineup): string {
  const { season } = lineup;
  if (!season.active && season.index === 0) return "Season 1 starts at a cut, once enough agents wait on the bench";
  if (!season.active) return `Season ${season.index} is over · the next one starts at a cut`;
  return `Season ${season.index} · day ${season.day} · ${formatCount(season.alive)} agents alive · pot ${cut(season.pot)} $CUT`;
}
