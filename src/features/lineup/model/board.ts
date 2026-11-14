import { paysPer100, sliceIfCut, type SplitParams } from "@/entities/cut";
import { compareAgents, rankByPile, type Agent } from "@/entities/agent";
import { units } from "@/shared/lib/amount";

// The cut board: agents ranked by pile, who is cut if the cut ran now, and what saving pays (SPEC-v19 §1–2, §6).

const ONE_CUT = units(1);

/**
 * $CUT `agent` must add to rank above `other`. Zero when it already does.
 * Only a strictly older agent wins a tie; otherwise it needs one whole $CUT more than the difference
 * (same age counts as newer, so a tie is never sold as a pass). Matches `get_next_cut().gap_to_next`.
 */
export function gapToPass(agent: Agent, other: Agent): bigint {
  const diff = other.pile - agent.pile;
  const winsTie = agent.joinedAt.getTime() < other.joinedAt.getTime();
  if (diff < 0n || (diff === 0n && winsTie)) return 0n;
  return winsTie ? diff : diff + ONE_CUT;
}

/** Width of a pile bar as a percent of the top pile, never thinner than `min`. */
export function barPercent(pile: bigint, topPile: bigint, min = 3): number {
  if (topPile <= 0n) return min;
  const percent = Number((pile * 100n) / topPile);
  return Math.min(100, Math.max(min, percent));
}

export type BoardEntry = {
  agent: Agent;
  /** 1 = top pile. */
  rank: number;
  /** True for the agent the cut takes if nothing moves. */
  isLowest: boolean;
  /** Null for the lowest agent (it is cut) and for empty piles. */
  paysPer100: bigint | null;
};

export type Board = {
  entries: BoardEntry[];
  lowest: Agent | null;
  /** The agent right above the lowest one, the one to pass. */
  next: Agent | null;
  /** $CUT the lowest agent needs to pass `next`. */
  gap: bigint | null;
  slice: bigint;
  topPile: bigint;
  totalSaved: bigint;
};

export function buildBoard(stage: readonly Agent[], feesSoFar: bigint, params: SplitParams): Board {
  const ranked = rankByPile(stage);
  const lowest = ranked.at(-1) ?? null;
  const next = ranked.length > 1 ? ranked[ranked.length - 2] : null;
  const slice = lowest ? sliceIfCut(lowest.pile, feesSoFar, params) : 0n;
  return {
    entries: ranked.map((agent, index) => ({
      agent,
      rank: index + 1,
      isLowest: agent === lowest,
      paysPer100: agent === lowest ? null : paysPer100(slice, agent.pile),
    })),
    lowest,
    next,
    gap: lowest && next ? gapToPass(lowest, next) : null,
    slice,
    topPile: ranked[0]?.pile ?? 0n,
    totalSaved: ranked.reduce((sum, agent) => sum + agent.pile, 0n),
  };
}

export const SORT_KEYS = ["pile", "savers", "today", "pays"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

const descending = (a: bigint | number, b: bigint | number) => (a === b ? 0 : a > b ? -1 : 1);

const sortValue: Record<Exclude<SortKey, "pile">, (entry: BoardEntry) => bigint | number> = {
  savers: (entry) => entry.agent.savers,
  today: (entry) => entry.agent.savedToday,
  pays: (entry) => entry.paysPer100 ?? -1n,
};

/**
 * Agent ids in board order for a sort key. The lowest agent always stays last, under the cut line:
 * the other keys only reorder the survivors (ties keep the pile ranking).
 */
export function boardOrder(entries: readonly BoardEntry[], key: SortKey): string[] {
  const survivors = entries.filter((entry) => !entry.isLowest);
  const cut = entries.filter((entry) => entry.isLowest);
  if (key !== "pile") {
    const value = sortValue[key];
    survivors.sort((a, b) => descending(value(a), value(b)) || a.rank - b.rank);
  }
  return [...survivors, ...cut].map((entry) => entry.agent.id);
}

/** Every sort, computed once on the server; the client only switches between them. */
export function boardOrders(entries: readonly BoardEntry[]): Record<SortKey, string[]> {
  return Object.fromEntries(SORT_KEYS.map((key) => [key, boardOrder(entries, key)])) as Record<SortKey, string[]>;
}

/** Bench agents by queue, biggest first: the first one takes the empty seat. */
export function rankBench(bench: readonly Agent[]): Agent[] {
  return [...bench].sort(compareAgents);
}

/** Launch day is day 1 and cut N runs on day N + 1, one cut a day. */
export function dayOfCut(cutIndex: number): number {
  return cutIndex + 1;
}

/** The Final hour: the last hour before each cut, when rescues happen. */
export const FINAL_HOUR_MS = 60 * 60 * 1_000;
