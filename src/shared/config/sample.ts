/** The design's signed-in member (docs/design/archive/SPEC-v19.md §2): the session when no one has signed in in sample mode. */
export const SAMPLE_ACCOUNT_ID = "mika.near";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** A past daily cut of the sample world (18:00 UTC); every sample time is laid out from the coming one. */
const SAMPLE_CUT_ANCHOR = Date.parse("2026-11-13T18:00:00Z");

/**
 * The sample world's coming cut: the next 18:00 UTC after `now`, so the sample day always counts down and never
 * shows "due". Sample times (moves, past cuts) are offsets from it, so the world stays coherent on any day.
 */
export function sampleCutAt(now: Date = new Date()): Date {
  const missed = Math.floor((now.getTime() - SAMPLE_CUT_ANCHOR) / DAY_MS) + 1;
  return new Date(SAMPLE_CUT_ANCHOR + Math.max(missed, 0) * DAY_MS);
}

/** `hours` before the coming sample cut (negative: after it). Fractions allowed: 4.5 = 4 h 30 min. */
export function sampleHoursBeforeCut(hours: number, now: Date = new Date()): Date {
  return new Date(sampleCutAt(now).getTime() - Math.round(hours * HOUR_MS));
}
