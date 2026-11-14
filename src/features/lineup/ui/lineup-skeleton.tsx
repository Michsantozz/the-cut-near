import { Skeleton } from "@/shared/ui/skeleton";

const CARDS = [0, 1, 2, 3, 4, 5];

/** First paint while the stage loads: placeholders in the shape of the screen, so nothing jumps. */
export function LineupSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the stage" className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-4 pt-2 pb-6 sm:max-w-none lg:gap-4 lg:px-8 lg:pt-1">
      <div className="mt-[62px] h-[190px] rounded-3xl border-2 border-ink bg-lime-soft lg:mt-[58px]" />
      <div className="h-[220px] rounded-3xl border-2 border-ink bg-violet-soft lg:h-[180px]" />
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((card) => (
          <li key={card} className="h-[330px] rounded-3xl border-2 border-ink bg-paper p-3.5">
            <div className="flex gap-3">
              <Skeleton className="size-[92px] shrink-0 rounded-2xl bg-canvas" />
              <div className="flex grow flex-col gap-2 pt-1">
                <Skeleton className="h-4 w-2/3 bg-line" />
                <Skeleton className="h-3 w-1/2 bg-canvas" />
                <Skeleton className="h-5 w-3/4 rounded-full bg-canvas" />
              </div>
            </div>
            <Skeleton className="mt-4 h-8 w-1/2 bg-line" />
            <Skeleton className="mt-3 h-24 rounded-lg bg-canvas" />
          </li>
        ))}
      </ol>
      <p className="text-center text-xs font-semibold text-ink-3">Loading the stage…</p>
    </div>
  );
}
