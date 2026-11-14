import { cn } from "cn";
import { Scissors } from "lucide-react";

import { AgentTile, pileShown, scoreShown } from "@/entities/agent";
import { NEAR_DECIMALS } from "@/shared/lib/amount";
import { formatAmount, formatCutTenths, formatUtcDate, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";

// Small pieces every landing section uses: number formats, the scissors rule on top of each band, the wordmark.

/** Whole $CUT for pots, prizes and supply: "182,400". */
export const cut = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });
/**
 * The score math (scores, piles, boos, damage, gaps), the way every screen of the app shows it: one decimal at most,
 * rounded down, "959.5", "41,200". Pass values from `scoreParts` or `gapShown` so the sums check out.
 */
export const cutTenths = (value: bigint) => formatCutTenths(value);
/** A score as the board shows it: "959.5". */
export const score = (value: bigint) => formatCutTenths(scoreShown(value));
/** A pile as the board shows it: "41,200", "959.5". */
export const pile = (value: bigint) => formatCutTenths(pileShown(value));
/** One decimal: "1,775.4". */
export const cutFine = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });
/** Two decimals: "6.32", "0.97". */
export const cut2 = (value: bigint) => formatAmount(value, { maxFractionDigits: 2, minFractionDigits: 2 });
/** NEAR amounts: "0.5", "5". */
export const near = (value: bigint) => formatAmount(value, { decimals: NEAR_DECIMALS, maxFractionDigits: 2 });
/** Basis points as a percent: 9_500 → "95%". */
export const percent = (bps: number) => `${bps / 100}%`;
/** A share in words where it reads better: 5_000 → "half", else the percent. */
export const portion = (bps: number) => (bps === 5_000 ? "half" : percent(bps));
/** Thousands with one decimal, rounded down so a score never reads higher: 182,400 → "182.4k", 1,150.9 → "1.1k". */
export const kilo = (value: bigint) => `${formatAmount(value / 1_000n, { maxFractionDigits: 1, minFractionDigits: 1, rounding: "floor" })}k`;
/** "Kiko Bun" → "Kiko". */
export const shortName = (name: string) => name.split(" ")[0] ?? name;

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
/** 10 → "ten"; past twenty, the digits. */
export const inWords = (count: number) => WORDS[count] ?? String(count);
export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "today", "tomorrow" or "Sat, Nov 14": when the next cut is, seen from `now`. */
export function cutDay(now: Date, at: Date): string {
  return relativeUtcDay(now, at) ?? formatUtcDate(at);
}

/** "Fri 13:48": a weekday and a UTC time. */
export function weekdayTime(at: Date): string {
  return `${formatUtcDate(at).split(",")[0]} ${formatUtcTime(at)}`;
}

/** The scissors and the dashed rule on top of each band: in the flow on a phone, pinned to the top on a laptop. */
export function SectionRule({ tone = "ink" }: { tone?: "ink" | "paper" | "paper-soft" }) {
  return (
    <div aria-hidden="true" className="mb-[22px] flex items-center gap-2.5 lg:absolute lg:inset-x-0 lg:top-[22px] lg:mb-0 lg:gap-3 lg:px-[72px]">
      <Scissors className={cn("size-5 shrink-0 lg:size-6", tone === "ink" ? "text-ink" : "text-paper")} strokeWidth={2.6} />
      <div className={cn("grow border-t-[3px] border-dashed", tone === "ink" ? "border-ink" : tone === "paper" ? "border-paper" : "border-paper/50")} />
    </div>
  );
}

type WordmarkSize = { width: number; height: number; font: number; tracking: number; shift: [number, number]; line: { x2: number; y1: number; y2: number; left: number; svg: number; stroke: number; dash: string } };

/** The design's four wordmarks: hero and footer, laptop and phone. */
export const WORDMARK = {
  hero: { width: 860, height: 236, font: 268, tracking: -8, shift: [10, 16], line: { x2: 850, y1: 168, y2: 127, left: -24, svg: 960, stroke: 4, dash: "14 10" } },
  heroPhone: { width: 222, height: 64, font: 73, tracking: -2.5, shift: [3, 5], line: { x2: 231, y1: 46, y2: 35, left: -6, svg: 236, stroke: 2.5, dash: "7 5" } },
  footer: { width: 640, height: 176, font: 200, tracking: -6, shift: [8, 12], line: { x2: 680, y1: 125, y2: 93, left: -18, svg: 700, stroke: 3.5, dash: "12 9" } },
  footerPhone: { width: 358, height: 96, font: 108, tracking: -4, shift: [5, 8], line: { x2: 360, y1: 68, y2: 51, left: -10, svg: 380, stroke: 3, dash: "10 7" } },
} satisfies Record<string, WordmarkSize>;

/** "the cut", cut in two along a pink dashed line: white above, lime below and shifted. */
export function Wordmark({ size, className }: { size: WordmarkSize; className?: string }) {
  const text = { fontSize: size.font, lineHeight: `${size.height}px`, letterSpacing: size.tracking };
  return (
    <div role="img" aria-label="the cut" className={cn("relative", className)} style={{ width: size.width, height: size.height }}>
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 font-heading font-extrabold whitespace-nowrap text-paper [clip-path:polygon(0_0,100%_0,100%_49%,0_67%)]"
        style={text}
      >
        the cut
      </div>
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 font-heading font-extrabold whitespace-nowrap text-lime [clip-path:polygon(0_67%,100%_49%,100%_100%,0_100%)]"
        style={{ ...text, transform: `translate(${size.shift[0]}px, ${size.shift[1]}px)` }}
      >
        the cut
      </div>
      <svg
        aria-hidden="true"
        width={size.line.svg}
        height={size.height}
        viewBox={`0 0 ${size.line.svg} ${size.height}`}
        className="absolute top-0 overflow-visible"
        style={{ left: size.line.left }}
      >
        <line x1="0" y1={size.line.y1} x2={size.line.x2} y2={size.line.y2} stroke="var(--color-pink)" strokeWidth={size.line.stroke} strokeDasharray={size.line.dash} strokeLinecap="round" />
      </svg>
    </div>
  );
}

/** An agent's head tile in the design's rounded square. */
export function Head({ id, name, className }: { id: string; name: string; className?: string }) {
  return <AgentTile id={id} name={name} className={className} />;
}
