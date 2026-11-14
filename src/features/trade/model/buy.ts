import { NEAR_DECIMALS, parseUnits, toDecimalText } from "@/shared/lib/amount";

import { ONE_NEAR, usdCentsToNear } from "./money";

// The Buy screen's amount: typed in dollars when a NEAR price is known (the design), in NEAR otherwise.

export type BuyUnit = "usd" | "near";

/** NEAR kept back for gas when buying with "Max". */
export const GAS_RESERVE = ONE_NEAR / 20n;

/**
 * Preset amounts: $50 / $100 / $250 (the design), or 0.1 / 0.5 / 1 NEAR. In NEAR there is no price to scale by, and
 * the testnet pool holds a few NEAR, so the chips stay small next to it and to a fresh wallet's balance.
 */
export const BUY_PRESETS: Record<BuyUnit, string[]> = { usd: ["50", "100", "250"], near: ["0.1", "0.5", "1"] };

/** The amount the screen opens with: $250 (the design), or 0.1 NEAR. */
export const DEFAULT_BUY: Record<BuyUnit, string> = { usd: "250", near: "0.1" };

/** What the field opens with: the default, or the wallet's "Max" when the default is more than it can buy. */
export function openingBuyText(unit: BuyUnit, usdCentsPerNear: bigint | null, max: bigint | null): string {
  const text = DEFAULT_BUY[unit];
  const nearIn = buyInputToNear(text, unit, usdCentsPerNear);
  if (max === null || nearIn === null || nearIn <= max) return text;
  const most = nearToBuyInput(max, unit, usdCentsPerNear);
  // A wallet that cannot buy even a rounded-down cent keeps the default, and the screen says why.
  return (buyInputToNear(most, unit, usdCentsPerNear) ?? 0n) > 0n ? most : text;
}

export const buyUnit = (usdCentsPerNear: bigint | null): BuyUnit => (usdCentsPerNear !== null && usdCentsPerNear > 0n ? "usd" : "near");

/** The typed amount as yoctoNEAR to attach; null while it is not a valid amount. */
export function buyInputToNear(text: string, unit: BuyUnit, usdCentsPerNear: bigint | null): bigint | null {
  if (unit === "near") return parseUnits(text, NEAR_DECIMALS);
  const cents = parseUnits(text, 2);
  if (cents === null || usdCentsPerNear === null) return null;
  return usdCentsToNear(cents, usdCentsPerNear);
}

/** The most NEAR a buy can attach: the balance less the gas reserve and a first-buy registration. Never negative. */
export function maxBuyNear(balance: bigint, registration: bigint): bigint {
  const max = balance - GAS_RESERVE - registration;
  return max > 0n ? max : 0n;
}

/** yoctoNEAR back to what the field shows for it (whole dollars rounded down, or NEAR with up to 2 decimals). */
export function nearToBuyInput(yocto: bigint, unit: BuyUnit, usdCentsPerNear: bigint | null): string {
  if (unit === "usd" && usdCentsPerNear !== null) return ((yocto * usdCentsPerNear) / ONE_NEAR / 100n).toString();
  return toDecimalText(yocto, NEAR_DECIMALS, 2);
}

/** Typing into the amount: digits and one point, at most `decimals` after it. Returns the old text for a bad key. */
export function editAmount(text: string, key: string, decimals: number): string {
  if (key === "backspace") return text.slice(0, -1);
  if (key === ".") return decimals === 0 || text.includes(".") ? text : `${text || "0"}.`;
  if (!/^\d$/.test(key)) return text;
  const [, fraction] = text.split(".");
  if (fraction !== undefined && fraction.length >= decimals) return text;
  if (text === "0") return key;
  if (text.replace(".", "").length >= 12) return text;
  return text + key;
}

/** Thousands separators on the whole part of a typed amount, keeping what follows the point: "1250.5" → "1,250.5". */
export function groupTyped(text: string): string {
  const [whole, fraction] = text.split(".");
  const grouped = (whole || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}
