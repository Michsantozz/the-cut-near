import { paysPer100, sliceIfCut, type SplitParams } from "@/entities/cut";
import { rankByPile, type Agent } from "@/entities/agent";
import { formatAmount } from "@/shared/ui/format";

// One agent's standing (Profile.dc.html, DeskProfile.dc.html): rank, what saving on it pays if the cut ran now,
// the banner for its situation, and the ladder of every pile.

const ONE_CUT = 10n ** 18n;
const cut = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });

export type Standing =
  | { place: "stage"; rank: number; of: number; isLowest: boolean; isSecondLowest: boolean }
  | { place: "bench"; rank: number; of: number }
  | { place: "deleted" };

export function standingOf(agent: Agent, stage: readonly Agent[], bench: readonly Agent[]): Standing {
  if (agent.status === "deleted") return { place: "deleted" };
  if (agent.status === "bench") {
    const ranked = rankByPile(bench);
    return { place: "bench", rank: ranked.findIndex((r) => r.id === agent.id) + 1, of: ranked.length };
  }
  const ranked = rankByPile(stage);
  const rank = ranked.findIndex((r) => r.id === agent.id) + 1;
  return { place: "stage", rank, of: ranked.length, isLowest: rank === ranked.length, isSecondLowest: ranked.length > 1 && rank === ranked.length - 1 };
}

/** $CUT `agent` needs to rank above `other`: a tie only goes to the older agent (the contract cuts the newer one). */
export function gapToPass(agent: Agent, other: Agent): bigint {
  const diff = other.pile - agent.pile;
  const winsTie = agent.joinedAt.getTime() < other.joinedAt.getTime();
  if (diff < 0n || (diff === 0n && winsTie)) return 0n;
  return winsTie ? diff : diff + ONE_CUT;
}

export type Pays = { per100: bigint; note: string };

/**
 * What 100 $CUT saved here pays if the cut ran now, with the design's one-line note. Null for the lowest agent
 * (it is the one cut), for the bench (no slice) and for empty piles.
 */
export function paysFor(agent: Agent, stage: readonly Agent[], feesSoFar: bigint, params: SplitParams, savedHere: bigint): Pays | null {
  const ranked = rankByPile(stage);
  const lowest = ranked.at(-1);
  if (agent.status !== "stage" || !lowest || lowest.id === agent.id) return null;
  const slice = sliceIfCut(lowest.pile, feesSoFar, params);
  const per100 = paysPer100(slice, agent.pile);
  if (per100 === null) return null;
  const top = ranked[0];
  let note: string;
  if (savedHere > 0n) note = `Your ${cut(savedHere)} would get ${formatAmount((slice * savedHere) / agent.pile, { maxFractionDigits: 2 })} $CUT.`;
  else if (top.id === agent.id) note = "Top pile: its slice is shared the thinnest.";
  else note = `${(Number((top.pile * 10n) / agent.pile) / 10).toFixed(1)}x what ${top.name} pays.`;
  return { per100, note };
}

export type Banner = { tone: "danger" | "bench" | "mine" | "close"; title: string; text: string; meter: { percent: number; left: string; right: string } | null };

export function bannerFor(agent: Agent, standing: Standing, stage: readonly Agent[], bench: readonly Agent[], savedHere: bigint, cutTime: string): Banner | null {
  const ranked = rankByPile(stage);
  if (standing.place === "stage" && standing.isLowest && ranked.length > 1) {
    const next = ranked[ranked.length - 2];
    const gap = gapToPass(agent, next);
    const short = agent.name.split(" ")[0];
    return {
      tone: "danger",
      title: "On the block · lowest pile",
      text: `Deleted at ${cutTime} if nothing moves. Lift ${short} past ${next.name} (${cut(gap)} $CUT) and it survives with the smallest pile: it pays the most per $CUT.`,
      meter: { percent: next.pile > 0n ? Number((agent.pile * 100n) / next.pile) : 0, left: `${agent.name} ${cut(agent.pile)}`, right: `${cut(gap)} short of ${next.name} · ${cut(next.pile)}` },
    };
  }
  if (standing.place === "bench") {
    const top = rankByPile(bench)[0];
    return top?.id === agent.id
      ? {
          tone: "bench",
          title: "On the bench · biggest queue",
          text: `Not on the stage yet, so its queue earns no slice. If anyone is cut, ${agent.name} takes the seat and its queue of ${cut(agent.pile)} $CUT becomes its pile.`,
          meter: null,
        }
      : { tone: "bench", title: "On the bench", text: "Not on the stage yet, so its queue earns no slice. The biggest queue takes the next empty seat.", meter: null };
  }
  if (savedHere > 0n) {
    return { tone: "mine", title: "Your agent", text: `You saved ${cut(savedHere)} here. If it survives, you share its slice with its other savers.`, meter: null };
  }
  if (standing.place === "stage" && standing.isSecondLowest) {
    const lowest = ranked.at(-1)!;
    return {
      tone: "close",
      title: "Just above the cut line",
      text: `Second-lowest pile, ${cut(agent.pile - lowest.pile)} $CUT ahead of ${lowest.name}. If ${lowest.name} passes it, ${agent.name} is cut instead.`,
      meter: null,
    };
  }
  return null;
}

export type LadderRow = { id: string; name: string; rank: number; pile: bigint; bar: number; me: boolean; lowest: boolean; bench: boolean; cutLineAbove: boolean; benchLineAbove: boolean };

export function ladder(agent: Agent, stage: readonly Agent[], bench: readonly Agent[]): LadderRow[] {
  const ranked = rankByPile(stage);
  const queues = rankByPile(bench);
  const top = ranked[0]?.pile ?? queues[0]?.pile ?? 0n;
  const bar = (pile: bigint) => (top > 0n ? Math.min(100, Math.max(3, Number((pile * 100n) / top))) : 3);
  return [
    ...ranked.map((r, i) => {
      const lowest = i === ranked.length - 1 && ranked.length > 1;
      return { id: r.id, name: r.name, rank: i + 1, pile: r.pile, bar: bar(r.pile), me: r.id === agent.id, lowest, bench: false, cutLineAbove: lowest, benchLineAbove: false };
    }),
    ...queues.map((r, i) => ({ id: r.id, name: r.name, rank: i + 1, pile: r.pile, bar: bar(r.pile), me: r.id === agent.id, lowest: false, bench: true, cutLineAbove: false, benchLineAbove: i === 0 })),
  ];
}
