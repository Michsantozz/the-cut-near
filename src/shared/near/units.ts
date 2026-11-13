import { z } from "zod";

// Wire formats of docs/contract-interface.md ("Units"). Every parser rejects values the contract
// cannot produce instead of coercing them.

const MAX_U128 = (1n << 128n) - 1n;
const MAX_U64 = (1n << 64n) - 1n;
const NS_PER_MS = 1_000_000n;

const digits = z.string().regex(/^(0|[1-9]\d*)$/, "must be a non-negative decimal integer string");

/** `U128` (a decimal string: yocto-$CUT or yoctoNEAR) to bigint. */
export const u128 = digits.transform((value, ctx) => {
  const n = BigInt(value);
  if (n > MAX_U128) ctx.addIssue({ code: "custom", message: "exceeds u128" });
  return n;
});

/**
 * An unsigned 64-bit value. `U64` arrives as a string; a bare `u64` arrives as a JSON number,
 * which JSON.parse has already rounded above 2^53 (so only small values are accepted as numbers).
 */
const u64Raw = z.union([digits, z.number().int().nonnegative()]).transform((value, ctx) => {
  const n = BigInt(value);
  if (n > MAX_U64) ctx.addIssue({ code: "custom", message: "exceeds u64" });
  return n;
});

/** A small `u64`/`u32` count or index (cut index, savers) as a safe JS number. */
export const u64Index = u64Raw.pipe(
  z.bigint().refine((n) => n <= BigInt(Number.MAX_SAFE_INTEGER), "exceeds Number.MAX_SAFE_INTEGER").transform(Number),
);

/**
 * Nanoseconds since the Unix epoch (`env::block_timestamp()`) to a Date, truncated to milliseconds.
 * Accepts a JSON number too: JSON.parse rounds it by up to 128 ns, so it stays accurate to the millisecond
 * (off by one only within 128 ns of a millisecond boundary).
 */
export const timestampNs = z.union([digits, z.number().nonnegative().refine(Number.isInteger, "must be an integer")]).transform((value, ctx) => {
  const ns = typeof value === "number" ? BigInt(Math.trunc(value)) : BigInt(value);
  if (ns > MAX_U64) ctx.addIssue({ code: "custom", message: "exceeds u64" });
  return new Date(Number(ns / NS_PER_MS));
});

/** A duration in nanoseconds to milliseconds. */
export const durationNs = u64Raw.transform((ns) => Number(ns / NS_PER_MS));

export const bps = z.number().int().min(0).max(10_000);

export function nsToDate(ns: bigint): Date {
  return new Date(Number(ns / NS_PER_MS));
}
