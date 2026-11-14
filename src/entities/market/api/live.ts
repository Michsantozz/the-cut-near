import "server-only";
import { getDb } from "@/shared/db/client";
import { CUT_DECIMALS } from "@/shared/lib/amount";
import { cutContract } from "@/shared/near/contract";
import { listJournal } from "@/shared/near/journal";
import type { JournalRow } from "@/shared/near/db/schema";
import type { ParamsView } from "@/shared/near/views";
import type { Params, PricePoint, PriceRange } from "../model/types";

const ONE_CUT = 10n ** BigInt(CUT_DECIMALS);
const DAY_MS = 86_400_000;

/** The launch parameters the app shows; the pool's initial reserves stay on the view. */
export function toParams(view: ParamsView): Params {
  const { totalSupply, feeBps, burnBps, saversBps, stageSize, firstCutAt, cutIntervalMs, robotFunding, registerDeposit } = view;
  return { totalSupply, feeBps, burnBps, saversBps, stageSize, firstCutAt, cutIntervalMs, robotFunding, registerDeposit };
}

export async function getLiveParams(): Promise<Params> {
  return toParams(await cutContract().getParams());
}

const big = (value: unknown): bigint | null => (typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : null);

/**
 * The price a `buy` or `sell` event traded at, in yoctoNEAR per whole $CUT, fee included: what the trader paid
 * (or got) per $CUT that changed hands. Null for any other event or a malformed one.
 */
export function tradePrice(row: Pick<JournalRow, "event" | "data" | "blockTimestamp">): PricePoint | null {
  const near = big(row.data.near_in) ?? big(row.data.near_out);
  const cut = row.event === "buy" ? big(row.data.cut_out) : row.event === "sell" ? big(row.data.cut_in) : null;
  if (near === null || cut === null || cut === 0n) return null;
  return { at: row.blockTimestamp, yoctoNearPerCut: (near * ONE_CUT) / cut };
}

/** Traded prices in the range, oldest first, from the journal's latest 200 trades. */
export async function getLivePriceHistory(range: PriceRange, now: Date): Promise<PricePoint[]> {
  const rows = await listJournal(getDb(), { events: ["buy", "sell"], limit: 200 });
  const since = range === "day" ? now.getTime() - DAY_MS : range === "week" ? now.getTime() - 7 * DAY_MS : 0;
  return rows
    .map(tradePrice)
    .filter((point): point is PricePoint => point !== null && point.at.getTime() >= since)
    .reverse();
}
