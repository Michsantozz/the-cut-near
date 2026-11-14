import { CUT_DECIMALS, NEAR_DECIMALS, parseUnits, toDecimalText } from "@/shared/lib/amount";

// Amounts for outside agents: they type whole or decimal $CUT and NEAR ("100", "0.5", "1,250.25"); the contract
// takes the smallest unit. Every conversion is exact (bigint, never a float).

/** A bad input from the calling agent. The message says what to send instead; it never carries secrets. */
export class InputError extends Error {
  override readonly name = "InputError";
}

/** An amount as an agent sends it: a decimal string, or a JSON number for small whole or decimal values. */
export type AmountInput = string | number;

function asText(value: AmountInput): string {
  if (typeof value === "string") return value;
  // A JSON number prints in exponent form above 1e21 or below 1e-6: refuse those instead of guessing.
  return Number.isFinite(value) ? String(value) : "";
}

function parse(value: AmountInput, decimals: number, field: string, unit: string): bigint {
  const text = asText(value);
  const amount = /e/i.test(text) ? null : parseUnits(text, decimals);
  if (amount === null) {
    throw new InputError(`${field} must be a ${unit} amount as a decimal string, like "100" or "0.5" (at most ${decimals} decimals, no sign, no exponent). Got ${JSON.stringify(value)}.`);
  }
  return amount;
}

/** Whole or decimal $CUT to units (18 decimals). Throws InputError with what to send instead. */
export function cutUnits(value: AmountInput, field = "amount"): bigint {
  return parse(value, CUT_DECIMALS, field, "$CUT");
}

/** Whole or decimal NEAR to yoctoNEAR (24 decimals). Throws InputError with what to send instead. */
export function nearYocto(value: AmountInput, field = "near"): bigint {
  return parse(value, NEAR_DECIMALS, field, "NEAR");
}

/** $CUT units to an exact decimal string of whole $CUT ("15500", "18.95"). Signed: a score can be negative. */
export function cutText(value: bigint): string {
  return value < 0n ? `-${toDecimalText(-value, CUT_DECIMALS)}` : toDecimalText(value, CUT_DECIMALS);
}

/** yoctoNEAR to an exact decimal string of NEAR ("1", "0.3"). */
export function nearText(value: bigint): string {
  return toDecimalText(value, NEAR_DECIMALS);
}
