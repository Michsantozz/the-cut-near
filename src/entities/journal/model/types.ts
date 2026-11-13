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
};
