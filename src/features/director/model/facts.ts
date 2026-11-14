import { sliceIfCut, type DeletingCut, type NextCut, type SplitParams } from "@/entities/cut";
import type { Params } from "@/entities/market";
import { rankByPile, type Agent } from "@/entities/agent";
import { countdownParts, formatCut, formatRatio, utcClock } from "./format";

// What the Director is allowed to know, already formatted the way the design writes numbers.
// The Director decides nothing: the lowest agent comes from the contract (`NextCut.lowestId`, `CutRecord`).

export type AgentFacts = {
  id: string;
  name: string;
  kind: string;
  pile: string;
  savers: number;
  savedToday: string;
  /** 1 = biggest pile. */
  rank: number;
  /** $CUT paid per 100 saved if the cut ran now (equal slice ÷ pile × 100); null for the agent that would be cut. */
  paysPer100: string | null;
};

export type BenchFacts = { id: string; name: string; kind: string; queue: string; savers: number };

export type DayFacts = {
  /** Day of the show: the first cut runs on day 2. */
  day: number;
  cutIndex: number;
  /** "18:00 UTC". */
  cutAt: string;
  countdown: { text: string; hours: number; minutes: number; clock: string };
  /** 17:00–18:00 UTC, the last hour before the cut. */
  finalHour: boolean;
  /** The day's fees the slice is computed with. */
  fees: string;
  /** One equal slice per surviving agent, if the cut ran now. */
  slice: string;
  stage: AgentFacts[];
  lowest: AgentFacts;
  nextUp: AgentFacts;
  top: AgentFacts;
  /** $CUT the lowest agent needs to pass the next one. */
  gap: string;
  bench: BenchFacts[];
};

export type DayInput = {
  stage: Agent[];
  bench: Agent[];
  nextCut: NextCut;
  params: SplitParams;
  now: Date;
  /** The day's fees to compute the slice with. Defaults to the fees so far (`NextCut.prizeSoFar`); SPEC-v19 uses the 5,020 expected by 18:00. */
  fees?: bigint;
};

const HOUR = 3_600_000;

export function buildDayFacts(input: DayInput): DayFacts {
  const { nextCut, params, now } = input;
  const byPile = rankByPile(input.stage);
  const lowestAgent = byPile.find((agent) => agent.id === nextCut.lowestId) ?? byPile[byPile.length - 1];
  if (!lowestAgent || byPile.length < 2) throw new Error("The Director needs at least two agents on the stage.");
  const fees = input.fees ?? nextCut.prizeSoFar;
  const slice = sliceIfCut(lowestAgent.pile, fees, params);

  const stage: AgentFacts[] = byPile.map((agent, index) => ({
    id: agent.id,
    name: agent.name,
    kind: agent.tagline,
    pile: formatCut(agent.pile),
    savers: agent.savers,
    savedToday: formatCut(agent.savedToday),
    rank: index + 1,
    paysPer100: agent.id === lowestAgent.id || agent.pile === 0n ? null : formatRatio(slice * 100n, agent.pile, 2),
  }));
  const lowest = stage.find((agent) => agent.id === lowestAgent.id) as AgentFacts;
  const survivors = stage.filter((agent) => agent.id !== lowest.id);
  const nextUp = survivors[survivors.length - 1];
  const top = survivors[0];

  const left = nextCut.at.getTime() - now.getTime();
  const countdown = countdownParts(left);
  return {
    day: nextCut.index + 1,
    cutIndex: nextCut.index,
    cutAt: `${utcClock(nextCut.at)} UTC`,
    countdown: { text: countdown.text, hours: countdown.hours, minutes: countdown.minutes, clock: countdown.clock },
    finalHour: left > 0 && left <= HOUR,
    fees: formatCut(fees),
    slice: formatCut(slice, 1),
    stage,
    lowest,
    nextUp,
    top,
    gap: formatCut(nextCut.gapToNext),
    bench: [...input.bench]
      .sort((a, b) => (a.pile === b.pile ? 0 : a.pile > b.pile ? -1 : 1))
      .map((agent) => ({ id: agent.id, name: agent.name, kind: agent.tagline, queue: formatCut(agent.pile), savers: agent.savers })),
  };
}

export type CutFacts = {
  index: number;
  /** "First cut", "Second cut", … */
  title: string;
  deleted: { id: string; name: string; kind: string; pile: string };
  burned: string;
  prize: string;
  slice: string;
  creatorSlice: string;
  joined: { id: string; name: string; pile: string } | null;
  runner: string;
  /** Agents on the stage after the cut. */
  agentsAfter: number;
  /** "tomorrow, 18:00 UTC" for a daily cut, "at 18:02 UTC" otherwise. */
  nextCut: string;
};

export type CutInput = {
  cut: DeletingCut;
  /** Every agent the cut names (stage before the cut and bench), for names and the joining queue. */
  agents: Agent[];
  params: Pick<Params, "stageSize" | "cutIntervalMs">;
};

const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];

export function buildCutFacts({ cut, agents, params }: CutInput): CutFacts {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const deleted = byId.get(cut.deletedId);
  const joined = cut.joinedId ? byId.get(cut.joinedId) : undefined;
  const next = new Date(cut.at.getTime() + params.cutIntervalMs);
  return {
    index: cut.index,
    title: cut.index >= 1 && cut.index <= ORDINALS.length ? `${ORDINALS[cut.index - 1]} cut` : `Cut ${cut.index}`,
    deleted: { id: cut.deletedId, name: deleted?.name ?? cut.deletedId, kind: deleted?.tagline ?? "agent", pile: formatCut(cut.pile) },
    burned: formatCut(cut.burned),
    prize: formatCut(cut.prize),
    slice: formatCut(cut.slice, 1),
    creatorSlice: formatCut(cut.creatorSlice, 1),
    joined: cut.joinedId ? { id: cut.joinedId, name: joined?.name ?? cut.joinedId, pile: formatCut(joined?.pile ?? 0n) } : null,
    runner: cut.runner,
    agentsAfter: cut.joinedId ? params.stageSize : params.stageSize - 1,
    nextCut: params.cutIntervalMs === 86_400_000 ? `tomorrow, ${utcClock(next)} UTC` : `at ${utcClock(next)} UTC`,
  };
}
