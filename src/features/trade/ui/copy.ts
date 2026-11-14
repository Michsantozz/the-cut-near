import { NEAR_DECIMALS } from "@/shared/lib/amount";
import { formatAmount, formatUsd, relativeUtcDay } from "@/shared/ui/format";

import { ONE_NEAR, cutToUsdCents, nearToUsdCents } from "../model/money";

/** $CUT with one decimal: "134.5". */
export const cutText = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });

/** Whole $CUT: "1,052,400". */
export const cutWhole = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });

/** NEAR: one decimal from 10 NEAR up ("99.9"), up to three below ("0.01"). */
export const nearText = (yocto: bigint) => formatAmount(yocto, { decimals: NEAR_DECIMALS, maxFractionDigits: yocto >= 10n * ONE_NEAR ? 1 : 3 });

/** "$2.50" when a NEAR price is known, else the NEAR amount: "1.02 NEAR". */
export function nearMoney(yocto: bigint, usdCentsPerNear: bigint | null): string {
  return usdCentsPerNear !== null ? formatUsd(nearToUsdCents(yocto, usdCentsPerNear)) : `${nearText(yocto)} NEAR`;
}

/** A $CUT amount as money: "$2.50" with a NEAR price, else "1.36 $CUT". */
export function cutMoney(cut: bigint, yoctoNearPerCut: bigint, usdCentsPerNear: bigint | null): string {
  return usdCentsPerNear !== null ? formatUsd(cutToUsdCents(cut, yoctoNearPerCut, usdCentsPerNear)) : `${formatAmount(cut, { maxFractionDigits: 2 })} $CUT`;
}

/** The price of one $CUT: "$1.84", or "0.736 NEAR" without a NEAR price. */
export function priceText(yoctoNearPerCut: bigint, usdCentsPerNear: bigint | null): string {
  return usdCentsPerNear !== null
    ? formatUsd(cutToUsdCents(10n ** 18n, yoctoNearPerCut, usdCentsPerNear))
    : `${formatAmount(yoctoNearPerCut, { decimals: NEAR_DECIMALS, maxFractionDigits: 3 })} NEAR`;
}

/** "today’s prize", "tomorrow’s prize" or "the next prize", for the cut the fees go to. */
export function prizeName(now: Date, cutAt: Date): string {
  const day = relativeUtcDay(now, cutAt);
  return day === "today" ? "today’s prize" : day === "tomorrow" ? "tomorrow’s prize" : "the next prize";
}

/** "today" / "tomorrow" after a time, or nothing. */
export function dayWord(now: Date, cutAt: Date): string {
  const day = relativeUtcDay(now, cutAt);
  return day ? ` ${day}` : "";
}

/** Whole dollars for balances: "$2,890". */
export function nearMoneyWhole(yocto: bigint, usdCentsPerNear: bigint | null): string {
  if (usdCentsPerNear === null) return `${nearText(yocto)} NEAR`;
  return formatUsd((nearToUsdCents(yocto, usdCentsPerNear) / 100n) * 100n).replace(/\.00$/, "");
}

/** "400 saved on Melody-9" or "600 saved on 2 robots". Null without saves. */
export function savedLine(saves: readonly { robotName: string; amount: bigint }[]): string | null {
  if (saves.length === 0) return null;
  const total = saves.reduce((sum, save) => sum + save.amount, 0n);
  return saves.length === 1 ? `${cutText(total)} saved on ${saves[0].robotName}` : `${cutText(total)} saved on ${saves.length} robots`;
}

/** Big money, short: "$18.4M", "$812.5K", "$950". */
export function compactUsd(cents: bigint): string {
  const dollars = cents / 100n;
  if (dollars >= 1_000_000n) return `$${formatAmount(cents, { decimals: 8, maxFractionDigits: 1 })}M`;
  if (dollars >= 1_000n) return `$${formatAmount(cents, { decimals: 5, maxFractionDigits: 1 })}K`;
  return formatUsd(cents).replace(/\.00$/, "");
}
