import { paysPer100, sliceIfCut, type SplitParams } from "@/entities/cut";
import { compareRobots, rankByPile, type Robot } from "@/entities/robot";
import { units } from "@/shared/lib/amount";

// The cut board: robots ranked by pile, who is cut if the cut ran now, and what saving pays (SPEC-v19 §1–2, §6).

const ONE_CUT = units(1);

/**
 * $CUT `robot` must add to rank above `other`. Zero when it already does.
 * Only a strictly older robot wins a tie; otherwise it needs one whole $CUT more than the difference
 * (same age counts as newer, so a tie is never sold as a pass). Matches `get_next_cut().gap_to_next`.
 */
export function gapToPass(robot: Robot, other: Robot): bigint {
  const diff = other.pile - robot.pile;
  const winsTie = robot.joinedAt.getTime() < other.joinedAt.getTime();
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
  robot: Robot;
  /** 1 = top pile. */
  rank: number;
  /** True for the robot the cut takes if nothing moves. */
  isLowest: boolean;
  /** Null for the lowest robot (it is cut) and for empty piles. */
  paysPer100: bigint | null;
};

export type Board = {
  entries: BoardEntry[];
  lowest: Robot | null;
  /** The robot right above the lowest one, the one to pass. */
  next: Robot | null;
  /** $CUT the lowest robot needs to pass `next`. */
  gap: bigint | null;
  slice: bigint;
  topPile: bigint;
  totalSaved: bigint;
};

export function buildBoard(stage: readonly Robot[], feesSoFar: bigint, params: SplitParams): Board {
  const ranked = rankByPile(stage);
  const lowest = ranked.at(-1) ?? null;
  const next = ranked.length > 1 ? ranked[ranked.length - 2] : null;
  const slice = lowest ? sliceIfCut(lowest.pile, feesSoFar, params) : 0n;
  return {
    entries: ranked.map((robot, index) => ({
      robot,
      rank: index + 1,
      isLowest: robot === lowest,
      paysPer100: robot === lowest ? null : paysPer100(slice, robot.pile),
    })),
    lowest,
    next,
    gap: lowest && next ? gapToPass(lowest, next) : null,
    slice,
    topPile: ranked[0]?.pile ?? 0n,
    totalSaved: ranked.reduce((sum, robot) => sum + robot.pile, 0n),
  };
}

export const SORT_KEYS = ["pile", "savers", "today", "pays"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

const descending = (a: bigint | number, b: bigint | number) => (a === b ? 0 : a > b ? -1 : 1);

const sortValue: Record<Exclude<SortKey, "pile">, (entry: BoardEntry) => bigint | number> = {
  savers: (entry) => entry.robot.savers,
  today: (entry) => entry.robot.savedToday,
  pays: (entry) => entry.paysPer100 ?? -1n,
};

/**
 * Robot ids in board order for a sort key. The lowest robot always stays last, under the cut line:
 * the other keys only reorder the survivors (ties keep the pile ranking).
 */
export function boardOrder(entries: readonly BoardEntry[], key: SortKey): string[] {
  const survivors = entries.filter((entry) => !entry.isLowest);
  const cut = entries.filter((entry) => entry.isLowest);
  if (key !== "pile") {
    const value = sortValue[key];
    survivors.sort((a, b) => descending(value(a), value(b)) || a.rank - b.rank);
  }
  return [...survivors, ...cut].map((entry) => entry.robot.id);
}

/** Every sort, computed once on the server; the client only switches between them. */
export function boardOrders(entries: readonly BoardEntry[]): Record<SortKey, string[]> {
  return Object.fromEntries(SORT_KEYS.map((key) => [key, boardOrder(entries, key)])) as Record<SortKey, string[]>;
}

/** Bench robots by queue, biggest first: the first one takes the empty seat. */
export function rankBench(bench: readonly Robot[]): Robot[] {
  return [...bench].sort(compareRobots);
}

/** Launch day is day 1 and cut N runs on day N + 1, one cut a day. */
export function dayOfCut(cutIndex: number): number {
  return cutIndex + 1;
}

/** The Final hour: the last hour before each cut, when rescues happen. */
export const FINAL_HOUR_MS = 60 * 60 * 1_000;
