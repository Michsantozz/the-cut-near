import "server-only";

import { units } from "@/shared/lib/amount";

// The entities do not expose a $CUT balance (`ft_balance_of`) or a NEAR/USD rate yet. Until they do, the
// design's signed-in member (SPEC-v19 §2: mika.near holds 674.2 $CUT, 1 NEAR = $2.50) stands in, so the member
// card shows real numbers for the sample day. Any other account shows its saves without a balance.

const SAMPLE_BALANCES = new Map<string, bigint>([["mika.near", units(6_742) / 10n]]);
const SAMPLE_USD_CENTS_PER_NEAR = 250n;

export type Holdings = { balance: bigint | null; usdCentsPerNear: bigint | null };

export async function getHoldings(accountId: string): Promise<Holdings> {
  const balance = SAMPLE_BALANCES.get(accountId) ?? null;
  return { balance, usdCentsPerNear: balance === null ? null : SAMPLE_USD_CENTS_PER_NEAR };
}
