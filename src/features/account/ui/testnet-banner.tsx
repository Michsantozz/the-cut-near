import { FlaskConical } from "lucide-react";
import Link from "next/link";

import { testnetBand } from "../model/copy";

/** The striped band test mode puts on every screen: nothing here is real money. Links to the test tour. */
export function TestnetBanner({ cutIntervalMs }: { cutIntervalMs?: number }) {
  return (
    <Link
      href="/test"
      className="mx-5 mt-3 flex h-[30px] items-center justify-center gap-1.5 rounded-lg border-2 border-ink bg-[repeating-linear-gradient(135deg,#ffd84d_0_10px,#ffe58a_10px_20px)] px-2 text-center text-[10.5px] font-extrabold tracking-[0.06em] uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:mx-8 lg:mt-3.5 lg:h-9 lg:text-[13px]"
    >
      <FlaskConical aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.6} />
      <span className="truncate">{testnetBand(cutIntervalMs)}</span>
    </Link>
  );
}
