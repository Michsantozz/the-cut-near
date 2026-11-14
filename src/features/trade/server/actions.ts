"use server";

import { quoteBuy, quoteSell } from "@/entities/market/server";

// Live quotes for the trade screens, read from the contract's `quote_buy` / `quote_sell` (or the sample pool).
// Amounts cross as decimal strings of the smallest unit, like the contract's U128.

const MAX_U128 = (1n << 128n) - 1n;

function amount(value: string): bigint {
  if (!/^\d{1,39}$/.test(value)) throw new Error("Invalid amount");
  const n = BigInt(value);
  if (n > MAX_U128) throw new Error("Invalid amount");
  return n;
}

export type QuoteText = { amountOut: string; fee: string };

/** $CUT out and the fee for `nearIn` yoctoNEAR. */
export async function quoteBuyAction(nearIn: string): Promise<QuoteText> {
  const quote = await quoteBuy(amount(nearIn));
  return { amountOut: quote.amountOut.toString(), fee: quote.fee.toString() };
}

/** yoctoNEAR out and the $CUT fee for `cutIn`. */
export async function quoteSellAction(cutIn: string): Promise<QuoteText> {
  const quote = await quoteSell(amount(cutIn));
  return { amountOut: quote.amountOut.toString(), fee: quote.fee.toString() };
}
