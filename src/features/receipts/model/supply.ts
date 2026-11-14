// Where every $CUT is (Receipts.dc.html "Where all 10,000,000 $CUT are").

export type Supply = {
  minted: bigint;
  burned: bigint;
  /** In piles and bench queues. */
  saved: bigint;
  /** In wallets and the pool. */
  free: bigint;
  /** Share of the minted supply saved, in tenths of a percent (105 = 10.5%). */
  savedPermille: number;
  freePermille: number;
};

export function supplyOf(minted: bigint, burned: bigint, saved: bigint): Supply {
  const free = minted - burned - saved;
  const permille = (part: bigint) => (minted > 0n ? Number((part * 1000n + minted / 2n) / minted) : 0);
  return { minted, burned, saved, free: free < 0n ? 0n : free, savedPermille: permille(saved), freePermille: permille(free < 0n ? 0n : free) };
}

/** 105 → "10.5%". */
export const percentText = (permille: number) => `${(permille / 10).toFixed(1)}%`;
