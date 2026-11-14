import { Sparkles } from "lucide-react";
import Link from "next/link";

/**
 * Sample mode's band on every screen: the agents, moves and numbers are a made-up world, nothing is read from
 * NEAR and nothing is signed. Sample mode never claims to be live.
 */
export function SampleWorldBanner() {
  return (
    <Link
      href="/inside"
      className="mx-5 mt-3 flex h-[30px] items-center justify-center gap-1.5 rounded-lg border-2 border-ink bg-violet-soft px-2 text-center text-[10.5px] font-extrabold tracking-[0.06em] uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:mx-8 lg:mt-3.5 lg:h-9 lg:text-[13px]"
    >
      <Sparkles aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.6} />
      <span className="truncate">
        Sample world<span className="hidden sm:inline"> · made-up agents, moves and numbers · nothing here is on NEAR</span>
      </span>
    </Link>
  );
}
