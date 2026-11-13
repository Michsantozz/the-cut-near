"use client";

import { cn } from "cn";
import { ChevronRight, Scissors } from "lucide-react";
import Link from "next/link";

import { formatCountdown, formatDuration, formatUtcDate, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";
import { useNow } from "@/shared/ui/use-now";

import { FINAL_HOUR_MS } from "../model/board";

type CountdownProps = { cutAt: number; renderedAt: number };

/** Live state of the next cut: time left, the last hour, and "due" once the time passed and nobody ran it yet. */
function useCut({ cutAt, renderedAt }: CountdownProps) {
  const now = useNow(renderedAt);
  const left = cutAt - now;
  const at = new Date(cutAt);
  const day = relativeUtcDay(new Date(now), at);
  return {
    at,
    left,
    due: left <= 0,
    finalHour: left > 0 && left <= FINAL_HOUR_MS,
    name: day === "today" ? "today’s cut" : day === "tomorrow" ? "tomorrow’s cut" : "the next cut",
  };
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The big countdown that opens the lineup. Turns black in the final hour. */
export function CountdownCard({ cutAt, renderedAt, day, className }: CountdownProps & { day: number; className?: string }) {
  const cut = useCut({ cutAt, renderedAt });
  const label = cut.finalHour ? `Final hour · ${cut.name}` : `${capitalize(cut.name)} · ${formatUtcDate(cut.at)}`;

  return (
    <Link
      href="/director"
      className={cn(
        "group block rounded-3xl border-2 border-ink py-2 pr-2.5 pl-3.5 shadow-hard outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-w-0 lg:flex-1 lg:pt-[13px] lg:pr-[18px] lg:pb-3.5 lg:pl-[22px]",
        cut.finalHour ? "bg-ink text-paper shadow-hard-violet" : "bg-violet text-paper",
        className,
      )}
    >
      <span className="flex h-[26px] items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-extrabold tracking-[0.045em] whitespace-nowrap uppercase lg:gap-[7px] lg:text-xs lg:tracking-[0.05em]">
          {cut.finalHour ? (
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-danger" />
          ) : (
            <Scissors aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.6} />
          )}
          <span className="truncate">
            {label}
            <span className="hidden lg:inline"> · Day {day}</span>
          </span>
        </span>
        <span className="flex h-[26px] shrink-0 items-center gap-[3px] rounded-xs border-2 border-ink bg-paper pr-[7px] pl-2.5 text-[11.5px] font-extrabold text-ink lg:hidden">
          See the show
          <ChevronRight aria-hidden="true" className="size-3" strokeWidth={3} />
        </span>
      </span>
      <span className="mt-0.5 flex items-center gap-3 lg:mt-1 lg:gap-3.5">
        <time
          dateTime={cut.at.toISOString()}
          role="timer"
          className={cn(
            "font-heading text-[44px] leading-[44px] font-extrabold tracking-[-1.5px] whitespace-nowrap lg:text-[56px] lg:leading-[58px] lg:tracking-[-2px]",
            cut.finalHour && "text-lime",
          )}
        >
          {formatCountdown(cut.left)}
        </time>
        <span className="min-w-0 whitespace-nowrap">
          <span className="block text-[15px] leading-[19px] font-extrabold lg:text-lg lg:leading-[23px]">{cut.due ? "The cut is due" : `to ${cut.name}`}</span>
          <span className="block text-[12.5px] leading-[17px] font-semibold text-violet-soft lg:text-sm lg:leading-[19px]">
            {cut.due ? "Anyone can run it now" : `${formatUtcTime(cut.at)} UTC · every day`}
          </span>
        </span>
      </span>
    </Link>
  );
}

/** The countdown folded into the visitor's hero on a laptop. */
export function CountdownPill({ cutAt, renderedAt, className }: CountdownProps & { className?: string }) {
  const cut = useCut({ cutAt, renderedAt });
  return (
    <Link
      href="/director"
      className={cn(
        "flex h-12 shrink-0 items-center gap-3 rounded-xl border-2 border-ink bg-violet pr-4 pl-3.5 text-paper shadow-hard-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <Scissors aria-hidden="true" className="size-[17px] shrink-0" strokeWidth={2.6} />
      <time dateTime={cut.at.toISOString()} role="timer" className="font-heading text-[30px] leading-8 font-extrabold tracking-[-1px] whitespace-nowrap">
        {formatCountdown(cut.left)}
      </time>
      <span className="whitespace-nowrap">
        <span className="block text-[13.5px] leading-4 font-extrabold">{cut.due ? "The cut is due" : `to ${cut.name}`}</span>
        <span className="block text-xs leading-[15px] font-semibold text-violet-soft">
          {cut.due ? "Anyone can run it now" : `${formatUtcTime(cut.at)} UTC · every day`}
        </span>
      </span>
    </Link>
  );
}

/** Time left in words, live: "4h 12m". */
export function TimeLeft(props: CountdownProps) {
  const cut = useCut(props);
  return <time dateTime={cut.at.toISOString()}>{cut.due ? "due now" : formatDuration(cut.left)}</time>;
}
