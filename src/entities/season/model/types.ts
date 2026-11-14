/** The current season, or the last one while the next waits to start. Mirrors `get_season`. */
export type Season = {
  /** 1 for the first season. */
  index: number;
  active: boolean;
  /** Day of the season: day 1 starts at the cut that seats the stage. */
  day: number;
  /** Agents still on the stage. */
  alive: number;
  /** $CUT the champion's savers split: half of every trade fee this season. */
  pot: bigint;
  /** The crowned agent once one is left standing; null during a season. */
  champion: string | null;
  /** Bench agents still missing before the next season can start; 0 when it starts at the next cut. */
  nextStartNeeds: number;
};

/** A crowned agent: its account stays forever as a trophy. */
export type Champion = { season: number; agentId: string; cutIndex: number; pot: bigint };
