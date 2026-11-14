import { units } from "@/shared/lib/amount";

import type { Agent } from "./types";

// Scores and their parts are shown in 0.1 $CUT steps. A score is rounded down (toward minus infinity), so it never
// reads higher than it is; the parts are picked so the line on screen adds up exactly: pile − boos − damage = score.

const TENTH = units(1) / 10n;

/** Rounded down to 0.1 $CUT, toward minus infinity. */
function floorTenth(value: bigint): bigint {
  const rest = ((value % TENTH) + TENTH) % TENTH;
  return value - rest;
}

/** Rounded up to 0.1 $CUT, toward plus infinity. */
function ceilTenth(value: bigint): bigint {
  const floor = floorTenth(value);
  return floor === value ? value : floor + TENTH;
}

/** A score as every screen shows it: rounded down to 0.1 $CUT. 959.59 → 959.5, -0.05 → -0.1. */
export function scoreShown(score: bigint): bigint {
  return floorTenth(score);
}

/** A pile as every screen shows it: rounded down to 0.1 $CUT. */
export function pileShown(pile: bigint): bigint {
  return floorTenth(pile);
}

export type ScoreParts = { pile: bigint; boos: bigint; damage: bigint; score: bigint };

/**
 * The score and its parts as shown, all in 0.1 $CUT steps, so that `pile - boos - damage === score` on screen too.
 * Pile and score are rounded down like everywhere else; boos and damage are each rounded down or up (never by more
 * than 0.1) to cover the difference between the two. Boos stay rounded down unless damage cannot take the rest.
 */
export function scoreParts(agent: Pick<Agent, "pile" | "boos" | "damage" | "score">): ScoreParts {
  const pile = pileShown(agent.pile);
  const score = scoreShown(agent.score);
  const taken = pile - score;
  const boosDown = floorTenth(agent.boos);
  const damageUp = ceilTenth(agent.damage);
  let damage = taken - boosDown < damageUp ? taken - boosDown : damageUp;
  if (damage < 0n) damage = 0n;
  return { pile, boos: taken - damage, damage, score };
}
