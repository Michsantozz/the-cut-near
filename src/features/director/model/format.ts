import { CUT_DECIMALS } from "@/shared/lib/amount";

const ONE_CUT = 10n ** BigInt(CUT_DECIMALS);

/** `numerator / denominator` rounded half up to `decimals`, with thousands separators: 1775.444 -> "1,775.4". */
export function formatRatio(numerator: bigint, denominator: bigint, decimals = 0): string {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  const negative = numerator < 0n;
  const scale = 10n ** BigInt(decimals);
  const scaled = ((negative ? -numerator : numerator) * scale * 2n + denominator) / (denominator * 2n);
  const whole = (scaled / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = decimals > 0 ? `.${(scaled % scale).toString().padStart(decimals, "0")}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/** A $CUT amount (18 decimals) as the design writes it: "23,600", "1,775.4". */
export const formatCut = (amount: bigint, decimals = 0): string => formatRatio(amount, ONE_CUT, decimals);

/** "4h 12m" (at least an hour left) and "0:42:10" (clock), from milliseconds left. */
export function countdownParts(msLeft: number): { hours: number; minutes: number; seconds: number; text: string; clock: string } {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const text = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return { hours, minutes, seconds, text, clock: `${hours}:${pad(minutes)}:${pad(seconds)}` };
}

/** "18:00" for a UTC instant. */
export function utcClock(at: Date): string {
  return `${at.getUTCHours().toString().padStart(2, "0")}:${at.getUTCMinutes().toString().padStart(2, "0")}`;
}
