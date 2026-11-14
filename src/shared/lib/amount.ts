/** $CUT and NEAR both use fixed-point integers on chain. */
export const CUT_DECIMALS = 18;
export const NEAR_DECIMALS = 24;

/** Whole units to the smallest unit, e.g. `units(182_400)` $CUT. Integers only. */
export function units(whole: number | bigint, decimals = CUT_DECIMALS): bigint {
  return BigInt(whole) * 10n ** BigInt(decimals);
}

const DECIMAL = /^(\d*)(?:\.(\d*))?$/;

/**
 * What a person typed ("134.5", "0.01", "1,000", ".5") to the smallest unit, without ever going through a float.
 * Null for anything that is not a plain non-negative decimal, or that has more fraction digits than `decimals`.
 * Thousands separators and surrounding spaces are ignored.
 */
export function parseUnits(text: string, decimals = CUT_DECIMALS): bigint | null {
  const clean = text.trim().replaceAll(",", "");
  const match = DECIMAL.exec(clean);
  if (!match) return null;
  const [, whole = "", fraction = ""] = match;
  if (whole === "" && fraction === "") return null;
  if (fraction.length > decimals) return null;
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

/**
 * The smallest unit back to an editable decimal string: no grouping, no trailing zeros, at most `maxFractionDigits`
 * digits (rounded down, so the text never asks for more than the amount). `134.5 × 10^18` → "134.5".
 */
export function toDecimalText(value: bigint, decimals = CUT_DECIMALS, maxFractionDigits = decimals): string {
  const unit = 10n ** BigInt(decimals);
  const whole = value / unit;
  const fraction = (value % unit).toString().padStart(decimals, "0").slice(0, maxFractionDigits).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
