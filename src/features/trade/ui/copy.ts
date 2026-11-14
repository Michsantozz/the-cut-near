import { NEAR_DECIMALS } from "@/shared/lib/amount";
import { formatAmount, formatSignificant, formatUsd, relativeUtcDay } from "@/shared/ui/format";

import { ONE_NEAR, cutToUsdCents, nearToUsdCents } from "../model/money";

/** $CUT with one decimal: "134.5". */
export const cutText = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });

/** A typed $CUT amount, exact to the two decimals the fields take: "0.05", "1,250.25". The button says what is sent. */
export const cutTyped = (value: bigint) => formatAmount(value, { maxFractionDigits: 2 });

/** Whole $CUT: "1,052,400". */
export const cutWhole = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });

/** NEAR: one decimal from 10 NEAR up ("99.9"), up to three below ("0.01"), three significant digits under 0.001 ("0.000412"). */
export const nearText = (yocto: bigint) => formatSignificant(yocto, { decimals: NEAR_DECIMALS, maxFractionDigits: yocto >= 10n * ONE_NEAR ? 1 : 3 });

/** "$2.50" when a NEAR price is known, else the NEAR amount: "1.02 NEAR". */
export function nearMoney(yocto: bigint, usdCentsPerNear: bigint | null): string {
  return usdCentsPerNear !== null ? formatUsd(nearToUsdCents(yocto, usdCentsPerNear)) : `${nearText(yocto)} NEAR`;
}

/** A $CUT amount as money: "$2.50" with a NEAR price, else "1.36 $CUT". */
export function cutMoney(cut: bigint, yoctoNearPerCut: bigint, usdCentsPerNear: bigint | null): string {
  return usdCentsPerNear !== null ? formatUsd(cutToUsdCents(cut, yoctoNearPerCut, usdCentsPerNear)) : `${formatAmount(cut, { maxFractionDigits: 2 })} $CUT`;
}

/** The price of one $CUT: "$1.84", or "0.0000107 NEAR" without a NEAR price or when it is under a cent. */
export function priceText(yoctoNearPerCut: bigint, usdCentsPerNear: bigint | null): string {
  const cents = usdCentsPerNear !== null ? cutToUsdCents(10n ** 18n, yoctoNearPerCut, usdCentsPerNear) : 0n;
  return cents >= 1n ? formatUsd(cents) : `${formatSignificant(yoctoNearPerCut, { decimals: NEAR_DECIMALS, maxFractionDigits: 3 })} NEAR`;
}

/**
 * Where the 1% trade fee goes (RULES.md `pot_bps`): "half to the season pot, half to tomorrow’s prize", or the
 * percentages when the split is not even.
 */
export function feeSplitText(potBps: number, prize: string): string {
  if (potBps === 5_000) return `half to the season pot, half to ${prize}`;
  if (potBps >= 10_000) return "to the season pot";
  if (potBps <= 0) return `to ${prize}`;
  return `${potBps / 100}% to the season pot, ${(10_000 - potBps) / 100}% to ${prize}`;
}

/** The part of a trade fee that goes to the day prize; the contract gives the pot its share rounded down. */
export const feeToPrize = (fee: bigint, potBps: number) => fee - (fee * BigInt(potBps)) / 10_000n;

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

/** "400 saved on Melody-9" or "600 saved on 2 agents". Null without saves. */
export function savedLine(saves: readonly { agentName: string; amount: bigint }[]): string | null {
  if (saves.length === 0) return null;
  const total = saves.reduce((sum, save) => sum + save.amount, 0n);
  return saves.length === 1 ? `${cutText(total)} saved on ${saves[0].agentName}` : `${cutText(total)} saved on ${saves.length} agents`;
}

/**
 * What the saves next to a balance can do now: "400 saved on Melody-9, locked till 18:00 UTC", "…, unlocked", or
 * both amounts when some saves rode through a cut and others are new. Null without saves.
 */
export function savesLockText(saves: readonly { agentName: string; amount: bigint; unlocked: boolean }[], lockedTill: string): string | null {
  const line = savedLine(saves);
  if (!line) return null;
  const locked = saves.filter((save) => !save.unlocked).reduce((sum, save) => sum + save.amount, 0n);
  const unlocked = saves.filter((save) => save.unlocked).reduce((sum, save) => sum + save.amount, 0n);
  if (unlocked === 0n) return `${line}, locked till ${lockedTill}`;
  if (locked === 0n) return `${line}, unlocked: take ${saves.length === 1 ? "it" : "them"} back to sell`;
  return `${line}: ${cutText(locked)} locked till ${lockedTill}, ${cutText(unlocked)} unlocked`;
}

/** Big money, short: "$18.4M", "$812.5K", "$950". */
export function compactUsd(cents: bigint): string {
  const dollars = cents / 100n;
  if (dollars >= 1_000_000n) return `$${formatAmount(cents, { decimals: 8, maxFractionDigits: 1 })}M`;
  if (dollars >= 1_000n) return `$${formatAmount(cents, { decimals: 5, maxFractionDigits: 1 })}K`;
  return formatUsd(cents).replace(/\.00$/, "");
}
