import type { PersonalityId } from "@/entities/agent";
import { CUT_DECIMALS, parseUnits } from "@/shared/lib/amount";

// What `register_agent({ id, name, tagline, x_handle, personality, charter, seed })` accepts (docs/design/SPEC-v20.md
// "Agent lifecycle"), checked in the browser before the wallet opens.

export const MAX_TEXT_BYTES = 32;
export const MAX_X_HANDLE_BYTES = 16;
/** The charter: the agent's character in its creator's words, part of every prompt. */
export const MAX_CHARTER_BYTES = 600;
/** NEAR account ids are at most 64 characters, so the agent id leaves room for `.<contract>`. */
export const MAX_ACCOUNT_ID = 64;

/** UTF-8 size, the way the contract counts text limits. */
export const byteLength = (value: string) => new TextEncoder().encode(value).length;
const bytes = byteLength;
const isSeparator = (char: string) => char === "-" || char === "_";

/**
 * The agent id as a NEAR sub-account label: 2 to 32 characters of a-z, 0-9, - and _, starting and ending with
 * a letter or digit, with no two separators in a row, and short enough that `<id>.<contract>` is a valid account.
 * Null when it is fine, else the contract's own message.
 */
export function agentIdError(id: string, contractId: string): string | null {
  if (id.length < 2 || id.length > 32) return "Agent id must be 2 to 32 characters";
  let previousSeparator = true;
  for (const char of id) {
    if (!/^[a-z0-9_-]$/.test(char)) return "Agent id may use only a-z, 0-9, - and _";
    if (isSeparator(char) && previousSeparator) return "Agent id cannot start with or repeat - or _";
    previousSeparator = isSeparator(char);
  }
  if (previousSeparator) return "Agent id cannot end with - or _";
  if (id.length + 1 + contractId.length > MAX_ACCOUNT_ID) return `${id}.${contractId} is longer than 64 characters`;
  return null;
}

/** "Melody-9" → "melody-9"; "Glitch Gremlin" → "glitchgremlin". A suggestion the creator can edit. */
export function suggestAgentId(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 32)
    .replace(/[-_]+$/g, "");
}

const FIELD_LABEL = { name: "Name", tagline: "Tagline" } as const;

/** Name or tagline: required, at most 32 bytes, no control characters. */
export function textError(value: string, field: "name" | "tagline"): string | null {
  const label = FIELD_LABEL[field];
  if (!value.trim()) return `${label} cannot be empty`;
  if (bytes(value) > MAX_TEXT_BYTES) return `${label} can be at most ${MAX_TEXT_BYTES} bytes`;
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return `${label} cannot contain control characters`;
  return null;
}

/** Charter: required, at most 600 bytes, no control characters except newline. */
export function charterError(charter: string): string | null {
  if (!charter.trim()) return "Write who your agent is";
  if (bytes(charter) > MAX_CHARTER_BYTES) return `A charter can be at most ${MAX_CHARTER_BYTES} bytes`;
  if (/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(charter)) return "A charter cannot contain control characters, only new lines";
  return null;
}

/**
 * The seed typed in whole $CUT: at least `minSeed`, and no more than `balance` when the balance is known.
 * Null when it is fine.
 */
export function seedError(seed: string, minSeed: bigint, balance: bigint | null): string | null {
  const amount = parseSeed(seed);
  if (amount === null) return "Type a whole number of $CUT";
  if (amount < minSeed) return `The seed is at least ${(minSeed / 10n ** BigInt(CUT_DECIMALS)).toLocaleString("en-US")} $CUT`;
  if (balance !== null && amount > balance) return "That is more $CUT than your wallet holds";
  return null;
}

/** Whole $CUT typed by the creator ("1,500") in yocto-$CUT, or null when it is not a whole number. */
export function parseSeed(seed: string): bigint | null {
  const clean = seed.trim().replaceAll(",", "");
  if (!/^\d+$/.test(clean)) return null;
  return parseUnits(clean);
}

/** X handle: optional `@`, then 1 to 15 letters, digits or _ (X's own rule, within the contract's 16 bytes). */
export function xHandleError(handle: string): string | null {
  if (!handle) return "Add the agent’s X account";
  if (!/^@?[A-Za-z0-9_]{1,15}$/.test(handle) || bytes(handle) > MAX_X_HANDLE_BYTES) return "An X handle is 1 to 15 letters, digits or _";
  return null;
}

/** "ChartwiseCut" → "@ChartwiseCut". */
export function normalizeXHandle(handle: string): string {
  const trimmed = handle.trim();
  return trimmed && !trimmed.startsWith("@") ? `@${trimmed}` : trimmed;
}

export type AgentForm = {
  id: string;
  name: string;
  tagline: string;
  xHandle: string;
  /** Null until the creator picks one. */
  personality: PersonalityId | null;
  charter: string;
  /** Whole $CUT, as typed. */
  seed: string;
};

/** What the form checks against the contract's parameters and the creator's wallet. */
export type FormLimits = { contractId: string; minSeed: bigint; balance: bigint | null };

/** Every problem with the form, by field. Empty when `register_agent` would accept it. */
export function formErrors(form: AgentForm, limits: FormLimits): Partial<Record<keyof AgentForm, string>> {
  const errors: Partial<Record<keyof AgentForm, string>> = {};
  const name = textError(form.name, "name");
  const tagline = textError(form.tagline, "tagline");
  const id = agentIdError(form.id, limits.contractId);
  const x = xHandleError(normalizeXHandle(form.xHandle));
  const charter = charterError(form.charter);
  const seed = seedError(form.seed, limits.minSeed, limits.balance);
  if (name) errors.name = name;
  if (tagline) errors.tagline = tagline;
  if (id) errors.id = id;
  if (x) errors.xHandle = x;
  if (!form.personality) errors.personality = "Pick a personality";
  if (charter) errors.charter = charter;
  if (seed) errors.seed = seed;
  return errors;
}

/**
 * The arguments of `register_agent`, as the contract names them. `seed` is yocto-$CUT as a decimal string (U128):
 * the contract moves it from the creator's balance into the new agent's wallet in the same call.
 */
export function registerArgs(form: AgentForm) {
  return {
    id: form.id,
    name: form.name.trim(),
    tagline: form.tagline.trim(),
    x_handle: normalizeXHandle(form.xHandle),
    personality: form.personality,
    charter: form.charter.trim(),
    seed: (parseSeed(form.seed) ?? 0n).toString(),
  };
}
