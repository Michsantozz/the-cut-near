import { CUT_DECIMALS } from "@/shared/lib/amount";

// Display formatting for the UI kit. Amounts stay bigint until they become text, so no float ever rounds a balance.

export type AmountFormat = {
  /** Decimals of the fixed-point integer. Defaults to $CUT's 18. */
  decimals?: number;
  /** Digits kept after the point, rounded half up. Defaults to 2. */
  maxFractionDigits?: number;
  /** Trailing zeros kept up to this many digits. Defaults to 0. */
  minFractionDigits?: number;
  /**
   * "half-up" (default) or "down": toward zero, for limits the contract enforces, so "up to 592.5"
   * never reads as a higher "593".
   */
  rounding?: "half-up" | "down";
};

const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** `182_400 × 10^18` → "182,400"; `674.2 × 10^18` → "674.2"; with `minFractionDigits: 2` → "674.20". */
export function formatAmount(value: bigint, format: AmountFormat = {}): string {
  const { decimals = CUT_DECIMALS, maxFractionDigits = 2, minFractionDigits = 0, rounding = "half-up" } = format;
  if (minFractionDigits > maxFractionDigits) throw new RangeError("minFractionDigits is above maxFractionDigits");

  const negative = value < 0n;
  const abs = negative ? -value : value;
  const unit = 10n ** BigInt(decimals);
  const keep = 10n ** BigInt(maxFractionDigits);
  // Half up: add half a unit before the integer division. Down: plain integer division.
  const scaled = rounding === "down" ? (abs * keep) / unit : (abs * keep * 2n + unit) / (unit * 2n);

  const whole = groupThousands((scaled / keep).toString());
  const fraction = (scaled % keep).toString().padStart(maxFractionDigits, "0");
  let trimmed = fraction;
  while (trimmed.length > minFractionDigits && trimmed.endsWith("0")) trimmed = trimmed.slice(0, -1);

  const text = trimmed ? `${whole}.${trimmed}` : whole;
  return negative && scaled !== 0n ? `-${text}` : text;
}

/**
 * Like `formatAmount`, but a value under 1 keeps `significant` digits instead of rounding to "0":
 * `0.0000107 NEAR` → "0.0000107", while `12.345` with `maxFractionDigits: 2` stays "12.35".
 */
export function formatSignificant(value: bigint, format: AmountFormat & { significant?: number } = {}): string {
  const { decimals = CUT_DECIMALS, maxFractionDigits = 2, significant = 3 } = format;
  const abs = value < 0n ? -value : value;
  const unit = 10n ** BigInt(decimals);
  if (abs === 0n || abs >= unit) return formatAmount(value, { ...format, decimals, maxFractionDigits });
  const leadingZeros = decimals - abs.toString().length;
  const digits = Math.min(decimals, Math.max(maxFractionDigits, leadingZeros + significant));
  return formatAmount(value, { ...format, decimals, maxFractionDigits: digits });
}

/** US cents → "$1,240.53". */
export function formatUsd(cents: bigint): string {
  const negative = cents < 0n;
  const text = formatAmount(negative ? -cents : cents, { decimals: 2, maxFractionDigits: 2, minFractionDigits: 2 });
  return `${negative ? "-" : ""}$${text}`;
}

/** Whole numbers with thousands separators: 1052400 → "1,052,400". */
export function formatCount(value: number): string {
  return groupThousands(Math.trunc(value).toString());
}

/** A count with its noun, plural unless it is 1: (1, "saver") → "1 saver", (2, "saver") → "2 savers". */
export function formatCountOf(value: number, noun: string, plural = `${noun}s`): string {
  return `${formatCount(value)} ${Math.trunc(value) === 1 ? noun : plural}`;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Time left as a clock: 15_120_000 ms → "4:12:00". Never negative. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Time left in words: "4h 12m", "42m", "under 1m". Never negative. */
export function formatDuration(ms: number): string {
  const left = Math.max(0, ms);
  const hours = Math.floor(left / HOUR);
  const minutes = Math.floor((left % HOUR) / MINUTE);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "under 1m";
}

const utcTime = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const utcDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** "18:00" (UTC). */
export function formatUtcTime(at: Date): string {
  return utcTime.format(at);
}

/** "Fri, Nov 13" (UTC). */
export function formatUtcDate(at: Date): string {
  return utcDate.format(at);
}

/** True when both instants fall on the same UTC calendar day. */
export function isSameUtcDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/** "today" or "tomorrow" for `at` seen from `now`, by UTC calendar day; null for any other day. */
export function relativeUtcDay(now: Date, at: Date): "today" | "tomorrow" | null {
  if (isSameUtcDay(now, at)) return "today";
  if (isSameUtcDay(new Date(now.getTime() + 24 * HOUR), at)) return "tomorrow";
  return null;
}
