import type { DeletingCut, NextCut } from "@/entities/cut";
import type { Params } from "@/entities/market";
import { gapShown, PERSONALITIES, rankByPile, rankByScore, scoreParts, type Agent } from "@/entities/agent";
import type { Move } from "@/entities/move";
import type { Season } from "@/entities/season";
import { NEAR_DECIMALS } from "@/shared/lib/amount";
import { formatCutTenths } from "@/shared/ui/format";
import { countdownParts, formatCut, formatRatio, utcClock } from "./format";

// What the Director is allowed to know, already formatted the way the design writes numbers (RULES.md).
// The Director decides nothing: the agent on the cut line comes from the contract (`NextCut.lowestId`, `CutRecord`),
// ranked by score (pile - boos - damage), and the agents' moves come signed from their own AI.

export type AgentFacts = {
  id: string;
  name: string;
  /** What it is, in its creator's words. */
  tagline: string;
  /** Its personality's label: "Miser", "Gambler", "Traitor", "Generous". */
  personality: string;
  /** `pile - boos - damage`: the lowest score is cut. Signed. */
  score: string;
  /** $CUT fans saved on it. */
  pile: string;
  /** $CUT fans burned to boo it before this cut. */
  boos: string;
  /** $CUT other agents' attacks took off its score for this cut. */
  damage: string;
  savers: number;
  savedToday: string;
  /** Its own $CUT wallet: what it can spend on moves, and what its heir gets if it is cut. */
  wallet: string;
  /** Name of its heir if that agent is still on the stage; null: its wallet burns if it is cut. */
  heir: string | null;
  /** 1 = highest score. */
  rank: number;
};

/** A bench agent: it waits for the next season; its queue becomes its pile when it takes a seat. */
export type BenchFacts = { id: string; name: string; tagline: string; personality: string; queue: string; savers: number };

/** An agent's signed move for the coming cut, as the contract recorded it (`get_moves`). */
export type DayMove = Pick<Move, "agentId" | "move" | "target" | "amount" | "reason" | "outcome"> & { heir?: string | null };

/** A move with names instead of ids, for the lines to quote. */
export type MoveFacts = { agentId: string; name: string; move: string; target: string | null; amount: string; reason: string; outcome: string | null; heir: string | null };

export type DayFacts = {
  /** Season number, 1 for the first. */
  season: number;
  /** Day of the season: day 1 runs up to the first cut after the season start. */
  day: number;
  cutIndex: number;
  /** "18:00 UTC". */
  cutAt: string;
  /** "17:00 UTC": agents' moves are refused from then on. */
  movesCloseAt: string;
  countdown: { text: string; hours: number; minutes: number; clock: string };
  /** The last hour before the cut: moves are closed, saves and boos still count. */
  finalHour: boolean;
  /** $CUT the champion's savers split at the end of the season. */
  pot: string;
  /** Highest score first. */
  stage: AgentFacts[];
  lowest: AgentFacts;
  nextUp: AgentFacts;
  top: AgentFacts;
  /** Score the lowest agent needs to pass the next one. */
  gap: string;
  /** Biggest queue first. */
  bench: BenchFacts[];
  /** Moves already made for this cut, by stage agents, in stage order. */
  moves: MoveFacts[];
};

export type DayInput = {
  stage: Agent[];
  bench: Agent[];
  nextCut: NextCut;
  season: Pick<Season, "index" | "day" | "pot">;
  now: Date;
  /** The moves made for `nextCut` so far. */
  moves?: DayMove[];
};

const HOUR = 3_600_000;

const personalityLabel = (agent: Pick<Agent, "personality">) => PERSONALITIES[agent.personality]?.label ?? agent.personality;

export function buildDayFacts(input: DayInput): DayFacts {
  const { nextCut, season, now } = input;
  const ranked = rankByScore(input.stage);
  const lowestAgent = ranked.find((agent) => agent.id === nextCut.lowestId) ?? ranked[ranked.length - 1];
  if (!lowestAgent || ranked.length < 2) throw new Error("The Director needs at least two agents on the stage.");
  const nameOf = (id: string | null) => (id ? (ranked.find((agent) => agent.id === id)?.name ?? null) : null);

  // Score math in the same 0.1 $CUT steps the screens show, so a quoted line never disagrees with the board.
  const stage: AgentFacts[] = ranked.map((agent, index) => {
    const parts = scoreParts(agent);
    return {
    id: agent.id,
    name: agent.name,
    tagline: agent.tagline,
    personality: personalityLabel(agent),
    score: formatCutTenths(parts.score),
    pile: formatCutTenths(parts.pile),
    boos: formatCutTenths(parts.boos),
    damage: formatCutTenths(parts.damage),
    savers: agent.savers,
    savedToday: formatCut(agent.savedToday),
    wallet: formatCut(agent.wallet),
    heir: agent.heir === agent.id ? null : nameOf(agent.heir),
    rank: index + 1,
    };
  });
  const lowest = stage.find((agent) => agent.id === lowestAgent.id) as AgentFacts;
  const survivors = stage.filter((agent) => agent.id !== lowest.id);
  const nextUp = survivors[survivors.length - 1];
  const nextUpAgent = ranked.find((agent) => agent.id === nextUp?.id);
  const top = survivors[0];

  const left = nextCut.at.getTime() - now.getTime();
  const countdown = countdownParts(left);
  return {
    season: season.index,
    day: season.day,
    cutIndex: nextCut.index,
    cutAt: `${utcClock(nextCut.at)} UTC`,
    movesCloseAt: `${utcClock(nextCut.movesCloseAt)} UTC`,
    countdown: { text: countdown.text, hours: countdown.hours, minutes: countdown.minutes, clock: countdown.clock },
    finalHour: left > 0 && left <= HOUR,
    pot: formatCut(season.pot),
    stage,
    lowest,
    nextUp,
    top,
    gap: formatCutTenths(nextUpAgent ? gapShown(lowestAgent, nextUpAgent) : 0n),
    bench: rankByPile(input.bench).map((agent) => ({ id: agent.id, name: agent.name, tagline: agent.tagline, personality: personalityLabel(agent), queue: formatCut(agent.pile), savers: agent.savers })),
    moves: stage.flatMap((agent) => {
      const move = input.moves?.find((m) => m.agentId === agent.id);
      if (!move) return [];
      const target = move.target ? (nameOf(move.target) ?? move.target) : null;
      const heir = move.heir ? (nameOf(move.heir) ?? move.heir) : null;
      return [{ agentId: agent.id, name: agent.name, move: move.move, target, amount: formatCut(move.amount), reason: move.reason, outcome: move.outcome, heir }];
    }),
  };
}

export type CutFacts = {
  index: number;
  /** "Third cut" (by season day), or "Cut 4" when the day is not known. */
  title: string;
  deleted: { id: string; name: string; tagline: string; personality: string; pile: string };
  /** Every $CUT the cut burned: attacks, half the pile, a capped prize's excess, an heirless wallet. */
  burned: string;
  /** The wallet its heir received; null when it burned with no living heir. */
  inherited: { name: string; amount: string } | null;
  prize: string;
  /** One survivor's savers' slice, before the cap at that survivor's pile. */
  slice: string;
  /** Agents left on the stage after the cut; null when not known. */
  survivors: number | null;
  /** The agent crowned at this cut, and what its savers got from the season pot. */
  champion: { id: string; name: string; potPaid: string } | null;
  runner: string;
  /** NEAR left in the deleted account, kept by the runner: "0.3". */
  funding: string;
  /** "tomorrow, 18:00 UTC" for a daily cut, "at 18:02 UTC" otherwise. */
  nextCut: string;
};

export type CutInput = {
  cut: DeletingCut;
  /** Every agent the cut names (the cut one, its heir, a champion), for names and personalities. */
  agents: Agent[];
  params: Pick<Params, "cutIntervalMs" | "agentFunding">;
  /** Day of the season the cut closed, for the title. */
  day?: number | null;
  /** Agents left on the stage after the cut. */
  survivors?: number | null;
};

const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh"];

export function buildCutFacts({ cut, agents, params, day = null, survivors = null }: CutInput): CutFacts {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const deleted = byId.get(cut.deletedId);
  const name = (id: string) => byId.get(id)?.name ?? id;
  const next = new Date(cut.at.getTime() + params.cutIntervalMs);
  return {
    index: cut.index,
    title: day !== null && day >= 1 && day <= ORDINALS.length ? `${ORDINALS[day - 1]} cut` : `Cut ${cut.index}`,
    deleted: {
      id: cut.deletedId,
      name: deleted?.name ?? cut.deletedId,
      tagline: deleted?.tagline ?? "AI agent",
      personality: deleted ? personalityLabel(deleted) : "unknown",
      pile: formatCut(cut.pile),
    },
    burned: formatCut(cut.burned),
    inherited: cut.inheritedBy ? { name: name(cut.inheritedBy), amount: formatCut(cut.wallet ?? 0n) } : null,
    prize: formatCut(cut.prize),
    slice: formatCut(cut.slice, 1),
    survivors: cut.championId ? 1 : survivors,
    champion: cut.championId ? { id: cut.championId, name: name(cut.championId), potPaid: formatCut(cut.potPaid) } : null,
    runner: cut.runner,
    funding: formatRatio(params.agentFunding, 10n ** BigInt(NEAR_DECIMALS), 2).replace(/\.?0+$/, ""),
    nextCut: params.cutIntervalMs === 86_400_000 ? `tomorrow, ${utcClock(next)} UTC` : `at ${utcClock(next)} UTC`,
  };
}
