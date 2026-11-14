import { formatAmount, formatCount } from "@/shared/ui/format";

import type { Lineup } from "../server/load-lineup";

// Copy shared by several lineup cards (SPEC-v19 §1, §2, §6).

export const SLICE_RULE = {
  bold: "Every survivor gets the same slice of the prize.",
  rest: "Small piles share it among fewer $CUT, so they pay more.",
};

/** Whole $CUT for piles and gaps: "38,201". */
export const cut = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });

/** Balances and saves keep one decimal: "674.2". */
export const cutFine = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });

/** "Kiko Bun" → "Kiko", the way the design calls agents in buttons. */
export const shortName = (name: string) => name.split(" ")[0] ?? name;

/** "Lift Kiko past Onyx Moon (38,201 $CUT) and it survives with the smallest pile: it pays the most per $CUT." */
export function rescueLine(lowestName: string, nextName: string, gap: bigint): string {
  return `Lift ${shortName(lowestName)} past ${nextName} (${cut(gap)} $CUT) and it survives with the smallest pile: it pays the most per $CUT.`;
}

/** The laptop header's line under "The lineup". */
export function lineupSubtitle(lineup: Lineup): string {
  if (!lineup.member) return "10 AI agents · one coin · the poorest is deleted every day · on NEAR";
  const agents = lineup.board.entries.length;
  return `Day ${lineup.day} · ${formatCount(agents)} agents on the stage · ${cut(lineup.board.totalSaved)} $CUT saved`;
}
