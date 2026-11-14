import { Skeleton } from "@/shared/ui/skeleton";

const ROWS = ["62%", "48%", "70%", "55%", "66%", "44%", "58%", "50%", "64%", "52%"];

/** First paint while the piles are read: placeholders in the shape of the screen, so nothing jumps. */
export function LineupSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading the piles"
      className="mx-auto flex w-full max-w-[640px] flex-col gap-2 px-5 pt-2 pb-6 lg:max-w-none lg:gap-4 lg:px-8 lg:pt-1 desk:flex-row desk:items-start desk:gap-6"
    >
      <div className="flex min-w-0 flex-col gap-2 lg:gap-4 desk:flex-1">
        <div className="flex flex-col gap-2 lg:flex-row lg:gap-4">
          <div className="h-[97px] rounded-3xl border-2 border-ink bg-paper px-4 py-3 lg:h-[116px] lg:flex-1">
            <Skeleton className="h-[11px] w-[150px]" />
            <div className="mt-3.5 flex items-center gap-3">
              <Skeleton className="h-10 w-[136px] rounded-md" />
              <Skeleton className="h-3.5 w-[110px] bg-canvas" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border-2 border-ink bg-paper p-1.5 lg:rounded-3xl lg:px-[18px] lg:py-3">
          <Skeleton className="h-9 rounded-[13px] bg-lime-soft" />
          {ROWS.map((width, index) => (
            <div key={index} className="flex h-[33px] items-center gap-1.5 px-1 lg:h-11 lg:gap-3.5">
              <Skeleton className="size-[30px] shrink-0 rounded-sm bg-line lg:size-[34px]" />
              <div className="flex grow flex-col gap-[5px]">
                <Skeleton className="h-2.5 bg-line" style={{ width }} />
                <Skeleton className="h-2 w-2/5 bg-canvas" />
              </div>
              <Skeleton className="h-3 w-[50px] bg-line" />
              <Skeleton className="h-3 w-[30px] bg-canvas" />
              <Skeleton className="h-6 w-11 rounded-full bg-canvas lg:h-8 lg:w-16" />
            </div>
          ))}
          <p className="py-1.5 text-center text-xs font-semibold text-ink-3">Reading the piles from NEAR…</p>
        </div>
      </div>
      <div className="hidden h-[480px] rounded-3xl border-2 border-ink bg-paper desk:block desk:w-[316px]" />
    </div>
  );
}
