"use client";

import { useEffect, useState } from "react";

import type { Quote } from "@/entities/market";

import type { QuoteText } from "../server/actions";

export const toQuote = (q: QuoteText): Quote => ({ amountOut: BigInt(q.amountOut), fee: BigInt(q.fee) });

/**
 * A live quote for `amount`, fetched 250 ms after the last change. Keeps showing the last quote while a new one
 * loads (`fresh` tells them apart); `initial` is the server's quote for the starting amount.
 */
export function useQuote(fetchQuote: (amount: string) => Promise<QuoteText>, amount: bigint | null, initial: { amount: bigint; quote: Quote } | null) {
  const [latest, setLatest] = useState(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (amount === null || amount <= 0n || latest?.amount === amount) return;
    let active = true;
    const timer = setTimeout(() => {
      fetchQuote(amount.toString()).then(
        (q) => {
          if (!active) return;
          setFailed(false);
          setLatest({ amount, quote: toQuote(q) });
        },
        () => active && setFailed(true),
      );
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [amount, fetchQuote, latest?.amount]);

  const valid = amount !== null && amount > 0n;
  return { quote: valid ? (latest?.quote ?? null) : null, fresh: valid && latest?.amount === amount, failed };
}
