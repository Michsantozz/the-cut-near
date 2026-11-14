/** The current season, or the last one while the next waits to start. Mirrors `get_season`. */
export type Season = {
  /** 1 for the first season; 0 before the first starts. */
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
export type Champion = {
  season: number;
  agentId: string;
  name: string;
  cutIndex: number;
  crownedAt: Date;
  /** $CUT the champion's savers received from the season pot. */
  pot: bigint;
  /** The champion's wallet, burned at the crown. */
  walletBurned: bigint;
};
