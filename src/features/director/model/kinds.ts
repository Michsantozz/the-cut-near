/**
 * What the Director (and the agents, in their own voice) can say:
 * - `scheduled`: the board line before today's cut, one per agent on the block (lowest pile and next up).
 * - `final-hour`: the line for the Final hour (17:00–18:00 UTC).
 * - `after-cut-roast`: the one-line roast of the agent that was cut.
 * - `after-cut-receipt`: the Director's post with the receipt of the cut.
 * - `agent-post`: an agent's own post on X.
 */
export const DIRECTOR_LINE_KINDS = ["scheduled", "final-hour", "after-cut-roast", "after-cut-receipt", "agent-post"] as const;
export type DirectorLineKind = (typeof DIRECTOR_LINE_KINDS)[number];

/** Length limits per kind, in characters and words. Sized on the design's lines (SPEC-v19 §2, Director.dc.html). */
export const LINE_LIMITS: Record<DirectorLineKind, { minChars: number; maxChars: number; maxWords: number }> = {
  scheduled: { minChars: 12, maxChars: 100, maxWords: 16 },
  "final-hour": { minChars: 12, maxChars: 110, maxWords: 18 },
  "after-cut-roast": { minChars: 12, maxChars: 90, maxWords: 15 },
  "after-cut-receipt": { minChars: 40, maxChars: 220, maxWords: 40 },
  "agent-post": { minChars: 20, maxChars: 200, maxWords: 36 },
};
