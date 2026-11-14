import { InputError } from "./amounts";

// Unsigned function calls on the main contract (docs/contract-interface.md "Change methods"), ready for the
// caller's own wallet to sign. Nothing here holds a key or signs.

/** One unsigned NEAR function call. `deposit` is yoctoNEAR and `gas` is gas units, both as decimal strings. */
export type PreparedCall = {
  receiver_id: string;
  method_name: string;
  args: Record<string, unknown>;
  deposit: string;
  gas: string;
  explain: string;
};

const TGAS = 1_000_000_000_000n;
const ONE_CUT = 10n ** 18n;
const ONE_NEAR = 10n ** 24n;

export const GAS = {
  /** buy, save, boo, unsave, claim: the app's own default. */
  standard: 100n * TGAS,
  /** The contract requires at least 50 TGas; 100 TGas is what scripts/testnet/launch.ts registers with. Unused gas is refunded. */
  register: 100n * TGAS,
  /** The contract requires at least 100 TGas; the keeper sends 300. */
  runCut: 300n * TGAS,
  /** The relay protocol: 300 TGas, no deposit. */
  submitMove: 300n * TGAS,
} as const;

/** `MIN_SAVE`: the smallest new save, and the smallest boo: 0.1 $CUT. */
export const MIN_SAVE = ONE_CUT / 10n;
export const MIN_BOO = ONE_CUT / 10n;
/** `MAX_SAVES_PER_ACCOUNT`. */
export const MAX_SAVES = 20;
/** `MAX_BENCH`. */
export const MAX_BENCH = 50;
/** NEP-145 `STORAGE_MIN`: a first buy or claim registers the account with 0.01 NEAR. */
export const STORAGE_MIN = ONE_NEAR / 100n;
/** A save is paid from the storage balance; below `enough` available, attach `topUp` (it stays in the storage balance). */
export const SAVE_STORAGE = { enough: (3n * ONE_NEAR) / 1000n, topUp: (5n * ONE_NEAR) / 1000n };

export const MAX_TEXT_BYTES = 32;
export const MAX_X_HANDLE_BYTES = 16;
export const MAX_CHARTER_BYTES = 600;
const MAX_ACCOUNT_ID = 64;

/** Least amount out the contract must deliver: the quote less the slippage, rounded down. */
export function minOut(quoted: bigint, slippageBps: number): bigint {
  if (quoted <= 0n) return 0n;
  return (quoted * BigInt(10_000 - slippageBps)) / 10_000n;
}

/** A slippage in percent (0 to 50, default 1) to basis points. */
export function slippageBps(percent: number | undefined): number {
  const value = percent ?? 1;
  if (!Number.isFinite(value) || value < 0 || value > 50) throw new InputError(`slippage_percent must be a number from 0 to 50 (default 1). Got ${JSON.stringify(percent)}.`);
  return Math.round(value * 100);
}

const byteLength = (value: string) => new TextEncoder().encode(value).length;
const isSeparator = (char: string) => char === "-" || char === "_";
// Rust's char::is_control: the Unicode Cc category.
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const CONTROL_BUT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;

/** The contract's `validate_agent_id`, plus the 64-character limit of `<id>.<contract>`. Null when it is fine. */
export function agentIdError(id: string, contractId: string): string | null {
  if (id.length < 2 || id.length > 32) return "Agent id must be 2 to 32 characters";
  let previousSeparator = true;
  for (const char of id) {
    if (!/^[a-z0-9_-]$/.test(char)) return "Agent id may use only a-z, 0-9, - and _";
    if (isSeparator(char) && previousSeparator) return "Agent id cannot start with or repeat - or _";
    previousSeparator = isSeparator(char);
  }
  if (previousSeparator) return "Agent id cannot end with - or _";
  if (id === "null" || id === "none") return "Agent id cannot be null or none";
  if (id.length + 1 + contractId.length > MAX_ACCOUNT_ID) return `${id}.${contractId} would be longer than 64 characters: pick a shorter id`;
  return null;
}

/** The contract's `validate_text`. Null when it is fine. */
export function textError(value: string, field: string, maxBytes: number, required: boolean): string | null {
  if (required && !value.trim()) return `${field} cannot be empty`;
  if (byteLength(value) > maxBytes) return `${field} can be at most ${maxBytes} bytes (it is ${byteLength(value)})`;
  if (CONTROL.test(value)) return `${field} cannot contain control characters`;
  return null;
}

/** The contract's `validate_charter` (newlines allowed). Null when it is fine. */
export function charterError(charter: string): string | null {
  if (!charter.trim()) return "charter cannot be empty: describe your agent's character in your own words";
  if (byteLength(charter) > MAX_CHARTER_BYTES) return `charter can be at most ${MAX_CHARTER_BYTES} bytes (it is ${byteLength(charter)})`;
  if (CONTROL_BUT_NEWLINE.test(charter)) return "charter cannot contain control characters other than newlines";
  return null;
}

export function call(receiverId: string, method: string, args: Record<string, unknown>, deposit: bigint, gas: bigint, explain: string): PreparedCall {
  return { receiver_id: receiverId, method_name: method, args, deposit: deposit.toString(), gas: gas.toString(), explain };
}
