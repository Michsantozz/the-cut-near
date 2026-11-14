import type { JournalEntry } from "@/entities/journal";
import type { Save } from "@/entities/save";

// How the viewer's prize from a cut was made (Earnings.dc.html, five steps): the cut pile, half burned,
// the prize (the other half plus the day's fees), one slice per survivor, and the viewer's share of its agent's slice.
// Only what was paid, read from the cut's `cut` and `prize` events.

export type Breakdown = {
  cutIndex: number;
  at: Date;
  cutAgentId: string | null;
  pile: bigint;
  /** The part of the cut pile that burned (`burn_bps`); the cut's own `burned` also counts attacks and wallets. */
  burned: bigint;
  prize: bigint;
  /** Fees since the previous cut that went into the prize. */
  fees: bigint;
  slice: bigint;
  survivors: number;
  saversBps: number;
  /** The survivor the viewer saved on, with the pile it had at the cut. */
  agentId: string;
  saved: bigint;
  agentPile: bigint;
  /** saved / agentPile of the slice, floored like the contract. */
  share: bigint;
};

function big(data: Record<string, unknown>, key: string): bigint {
  const value = data[key];
  return typeof value === "string" && /^\d{1,39}$/.test(value) ? BigInt(value) : 0n;
}

/** The viewer's share of an agent's slice: pro rata by $CUT saved, floored. */
export function shareOf(slice: bigint, saved: bigint, pile: bigint): bigint {
  return pile > 0n ? (slice * saved) / pile : 0n;
}

/**
 * The breakdown of the newest cut in which the viewer had a save on a survivor, or null. `cutEvents` and
 * `prizeEvents` come from the journal; `saves` are the viewer's saves now (a save rides from cut to cut).
 */
export function latestBreakdown(
  cutEvents: readonly JournalEntry[],
  prizeEvents: readonly JournalEntry[],
  saves: readonly Save[],
  saversBps: number,
  burnBps = 5_000,
): Breakdown | null {
  const savedOn = new Map(saves.filter((s) => s.amount > 0n).map((s) => [s.agentId, s]));
  const cuts = [...cutEvents].sort((a, b) => (b.cutIndex ?? 0) - (a.cutIndex ?? 0));
  for (const cut of cuts) {
    const index = cut.cutIndex;
    if (index === null) continue;
    const candidates = prizeEvents
      // v1 marks an empty pile's burned slice with `burned: true`; v2 pays 0 to an empty pile.
      .filter((p) => p.cutIndex === index && p.agentId && p.data.burned !== true && big(p.data, "slice") > 0n)
      .map((p) => ({ p, save: savedOn.get(p.agentId!) }))
      // Only a save locked for this cut (or an earlier one) was in the pile when it ran.
      .filter((c): c is { p: JournalEntry; save: Save } => c.save !== undefined && c.save.lockedForCut <= index)
      .sort((a, b) => (a.save.amount === b.save.amount ? 0 : a.save.amount > b.save.amount ? -1 : 1));
    const best = candidates[0];
    if (!best) continue;
    const pile = big(cut.data, "pile");
    const burned = (pile * BigInt(burnBps)) / 10_000n;
    const prize = big(cut.data, "prize");
    const slice = big(best.p.data, "slice");
    const agentPile = big(best.p.data, "pile");
    const survivors = typeof cut.data.survivors === "number" ? cut.data.survivors : 0;
    return {
      cutIndex: index,
      at: cut.at,
      cutAgentId: typeof cut.data.agent_id === "string" ? cut.data.agent_id : null,
      pile,
      burned,
      prize,
      fees: prize > pile - burned ? prize - (pile - burned) : 0n,
      slice,
      survivors,
      saversBps,
      agentId: best.save.agentId,
      saved: best.save.amount,
      agentPile,
      share: shareOf(slice, best.save.amount, agentPile),
    };
  }
  return null;
}
