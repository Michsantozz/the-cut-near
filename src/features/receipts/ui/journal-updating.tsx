"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Time for the server's journal catch-up to land before the page loads again. */
const RELOAD_AFTER_MS = 5_000;

/**
 * Shown while the server is still reading the newest blocks into the journal: says so, then loads
 * the page again once. The server starts at most one catch-up per 30 s, so this cannot loop fast.
 */
export function JournalUpdating() {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => router.refresh(), RELOAD_AFTER_MS);
    return () => clearTimeout(timer);
  }, [router]);
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-[12.5px] leading-[17px] font-bold text-ink-2 lg:text-[13.5px]">
      <RotateCw aria-hidden="true" className="size-3.5 animate-spin" strokeWidth={2.8} />
      Updating from NEAR…
    </span>
  );
}
