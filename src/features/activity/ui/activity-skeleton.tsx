import { Skeleton } from "@/shared/ui/skeleton";

/** First paint while the journal is read. */
export function ActivitySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your activity" className="mx-auto max-w-[640px] px-5 pt-[18px] lg:max-w-none lg:px-8 lg:pt-1">
      <div className="hidden h-[218px] rounded-[22px] border-2 border-ink bg-paper lg:block" />
      <div className="mt-4 rounded-[18px] border-2 border-ink bg-paper p-3 lg:rounded-[22px] lg:p-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex h-[52px] items-center gap-2.5 lg:h-16">
            <Skeleton className="size-8 rounded-[10px] bg-line lg:size-9" />
            <div className="flex grow flex-col gap-1.5">
              <Skeleton className="h-3 w-1/2 bg-line" />
              <Skeleton className="h-2.5 w-1/3 bg-canvas" />
            </div>
            <Skeleton className="h-3.5 w-14 bg-line" />
          </div>
        ))}
      </div>
    </div>
  );
}
