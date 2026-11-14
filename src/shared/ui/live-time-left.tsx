"use client";

import { formatCountdown, formatDuration } from "./format";
import { useNow } from "./use-now";

/**
 * Time left until `at`, live: "4:12:09" as a clock or "4h 12m" in words, then `doneLabel` once it has passed.
 * `renderedAt` is the server's request time, so the server markup and hydration match.
 */
export function LiveTimeLeft({ at, renderedAt, style = "words", doneLabel = "now", className }: { at: number; renderedAt: number; style?: "clock" | "words"; doneLabel?: string; className?: string }) {
  const left = at - useNow(renderedAt);
  return (
    <time dateTime={new Date(at).toISOString()} className={className}>
      {left <= 0 ? doneLabel : style === "clock" ? formatCountdown(left) : formatDuration(left)}
    </time>
  );
}
