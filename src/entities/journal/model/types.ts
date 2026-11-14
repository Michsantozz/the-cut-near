/**
 * One event from the contract's public log (NEP-297), as indexed into the journal. The Receipts
 * page and every history list read these.
 */
export type JournalEntry = {
  /** Stable key: receipt id, log index and item index. */
  id: string;
  /** "thecut" for the contract's own events, "nep141" for ft_mint / ft_burn / ft_transfer. */
  standard: string;
  /** buy, sell, fee, save, unsave, cut, delete, prize, join, register, ft_mint, ft_burn… */
  event: string;
  at: Date;
  txHash: string;
  blockHeight: number;
  accountId: string | null;
  robotId: string | null;
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
  robotId?: string;
  cutIndex?: number;
  events?: readonly string[];
  before?: { blockHeight: number; id: number };
  /** 1..200, default 50. */
  limit?: number;
  /**
   * Sample data only, live reads ignore it. The design shows the after-cut screens (Prizes, notifications) a minute
   * after cut #1 ran and every other screen at 13:48 before it (docs/design/SPEC-v19.md §2). Default "before-cut".
   */
  sampleMoment?: SampleMoment;
};

export type SampleMoment = "before-cut" | "after-cut";

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
  /** `cut` events, including cuts where nobody was on the stage to cut. */
  cuts: number;
  /** Accounts with at least one `buy`. */
  buyers: number;
  /** Robot ids that have a `register` event. */
  registered: string[];
};
