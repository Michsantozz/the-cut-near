import type { Pool, Quote } from "./types";

// The pool's quotes, rounded exactly like the contract (`contracts/thecut/src/math.rs`): constant product,
// the 1% fee always taken in $CUT, every division floors. Used for sample data; live reads `quote_buy` / `quote_sell`.

const BPS = 10_000n;

/** $CUT out (after the fee) and the fee for `nearIn` yoctoNEAR. Zero for an empty pool or no input. */
export function quoteBuy(pool: Pool, nearIn: bigint): Quote {
  if (nearIn <= 0n || pool.nearReserve + nearIn <= 0n) return { amountOut: 0n, fee: 0n };
  const grossOut = (pool.cutReserve * nearIn) / (pool.nearReserve + nearIn);
  const fee = (grossOut * BigInt(pool.feeBps)) / BPS;
  return { amountOut: grossOut - fee, fee };
}

/** yoctoNEAR out and the $CUT fee for selling `cutIn`. Zero for an empty pool or no input. */
export function quoteSell(pool: Pool, cutIn: bigint): Quote {
  if (cutIn <= 0n) return { amountOut: 0n, fee: 0n };
  const fee = (cutIn * BigInt(pool.feeBps)) / BPS;
  const netIn = cutIn - fee;
  if (pool.cutReserve + netIn <= 0n) return { amountOut: 0n, fee };
  return { amountOut: (pool.nearReserve * netIn) / (pool.cutReserve + netIn), fee };
}
