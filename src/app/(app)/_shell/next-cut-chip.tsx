"use client";

import { Scissors } from "lucide-react";

import { FINAL_HOUR_MS } from "@/features/lineup/model/board";
import { formatCountdown, formatDuration, formatUtcTime } from "@/shared/ui/format";
import { useNow } from "@/shared/ui/use-now";

/** The header chip: "Next cut in 4h 12m · 18:00 UTC", a clock in the final hour, "due" once the time has passed. */
export function NextCutChip({ cutAt, renderedAt }: { cutAt: number; renderedAt: number }) {
  const left = cutAt - useNow(renderedAt);
  const time = `${formatUtcTime(new Date(cutAt))} UTC`;
  const text = left <= 0 ? `Cut due now · ${time}` : left <= FINAL_HOUR_MS ? `Cut in ${formatCountdown(left)} · ${time}` : `Next cut in ${formatDuration(left)} · ${time}`;

  return (
    <span className="inline-flex h-10 items-center gap-[7px] rounded-full border-2 border-ink bg-paper px-3.5 text-[13.5px] font-bold whitespace-nowrap">
      <Scissors aria-hidden="true" className="size-4" strokeWidth={2.6} />
      {text}
    </span>
  );
}
