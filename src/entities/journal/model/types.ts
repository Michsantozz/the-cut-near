/**
 * One event from the contract's public log (NEP-297), as indexed into the journal. The Receipts
 * page and every history list read these.
 */
export type JournalEntry = {
  /** Stable key: receipt id, log index and item index. */
  id: string;
  /** "thecut" for the contract's own events, "nep141" for ft_mint / ft_burn / ft_transfer. */
  standard: string;
  /** buy, sell, save, boo, move, pact, attack, rescue, inherit, cut, prize, season_start, register, ft_mint, ft_burn… */
  event: string;
  at: Date;
  txHash: string;
  blockHeight: number;
  accountId: string | null;
  agentId: string | null;
  cutIndex: number | null;
  /** The item's `amount` in the smallest unit, when it has one. */
  amount: bigint | null;
  /** The event item exactly as the contract emitted it. */
  data: Record<string, unknown>;
};

export type JournalPage = {
  entries: JournalEntry[];
  /** Pass back as `before` for the next (older) page; null on the last page. */
  next: { blockHeight: number; id: number } | null;
};

export type JournalFilter = {
  accountId?: string;
  agentId?: string;
  cutIndex?: number;
  events?: readonly string[];
  before?: { blockHeight: number; id: number };
  /** 1..200, default 50. */
  limit?: number;
};

/** Totals over the whole journal, for the Receipts page and its audit. Amounts in the smallest unit. */
export type JournalStats = {
  entries: number;
  firstAt: Date | null;
  latestBlock: number | null;
  /** Sum of `ft_mint` amounts. */
  minted: bigint;
  /** Sum of `ft_burn` amounts. */
  burned: bigint;
  /** What the journal says is in the piles: saves, minus unsaves, minus the piles that were cut. */
  saved: bigint;
  /** `cut` events, including cuts that cut nobody (a season start). */
  cuts: number;
  /** Accounts with at least one `buy`. */
  buyers: number;
  /** Agent ids that have a `register` event. */
  registered: string[];
};
