"use client";

import { formatDuration } from "@/shared/ui/format";
import { useNow } from "@/shared/ui/use-now";

/** Time left to the cut in words, live: "4h 12m". */
export function CutClock({ cutAt, renderedAt }: { cutAt: number; renderedAt: number }) {
  const now = useNow(renderedAt);
  return (
    <time dateTime={new Date(cutAt).toISOString()} role="timer">
      {formatDuration(cutAt - now)}
    </time>
  );
}
