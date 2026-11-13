import { cn } from "cn";

/** The blue "c" tile and the wordmark. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 lg:gap-2.5", className)}>
      <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-[11px] border-2 border-ink bg-blue text-paper">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M18 7.5A7 7 0 1 0 18 16.5" />
        </svg>
      </span>
      <span className="font-heading text-2xl font-extrabold tracking-[-0.5px] lg:tracking-normal">the cut</span>
    </span>
  );
}
