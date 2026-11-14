"use client";

import { formatDuration } from "@/shared/ui/format";
import { useNow } from "@/shared/ui/use-now";

/** "4h 12m" to the next cut, ticking. */
export function TimeLeft({ cutAt, renderedAt }: { cutAt: number; renderedAt: number }) {
  return <>{formatDuration(cutAt - useNow(renderedAt))}</>;
}
