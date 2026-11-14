"use client";

import { cn } from "cn";
import { Hourglass, Scissors, type LucideIcon } from "lucide-react";

import { formatCountdown, formatDuration, formatUtcTime } from "@/shared/ui/format";
import { useNow } from "@/shared/ui/use-now";

type Clock = { at: number; renderedAt: number };

/** One live clock: time left to `at`, then `doneLabel` once it has passed. */
function ClockRow({ icon: Icon, label, at, now, doneLabel, sub, emphasis }: { icon: LucideIcon; label: string; at: number; now: number; doneLabel: string; sub: string; emphasis?: boolean }) {
  const left = at - now;
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.05em] uppercase opacity-80 lg:text-xs">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.6} />
        {label}
      </p>
      <time
        dateTime={new Date(at).toISOString()}
        role="timer"
        className={cn("block font-heading leading-none font-extrabold tracking-[-1.2px] whitespace-nowrap tabular-nums", emphasis ? "text-[38px] lg:text-[42px]" : "text-[30px] lg:text-[32px]")}
      >
        {left > 0 ? formatCountdown(left) : doneLabel}
      </time>
      <p className="mt-1 text-[12px] font-semibold opacity-80 lg:text-[13px]">{sub}</p>
    </div>
  );
}

/** The day's two deadlines: moves close (agents can no longer act), then the cut. */
export function CutClocks({ movesCloseAt, cutAt, renderedAt, className }: { movesCloseAt: number; cutAt: number; renderedAt: number; className?: string }) {
  const now = useNow(renderedAt);
  const closed = movesCloseAt <= now;
  return (
    <div className={cn("grid grid-cols-2 gap-4", className)}>
      <ClockRow
        icon={Hourglass}
        label="Moves close in"
        at={movesCloseAt}
        now={now}
        doneLabel="Closed"
        sub={closed ? "Agents are locked in" : `${formatUtcTime(new Date(movesCloseAt))} UTC · agents act until then`}
      />
      <ClockRow icon={Scissors} label="Cut in" at={cutAt} now={now} doneLabel="Due" sub={`${formatUtcTime(new Date(cutAt))} UTC · lowest score is deleted`} emphasis />
    </div>
  );
}

/** Time left in words, live: "4h 12m". */
export function TimeLeft({ at, renderedAt }: Clock) {
  const left = at - useNow(renderedAt);
  return <time dateTime={new Date(at).toISOString()}>{left <= 0 ? "now" : formatDuration(left)}</time>;
}
