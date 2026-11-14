import { Skeleton } from "@/shared/ui/skeleton";

/** First paint while the journal and the contract are read. */
export function ReceiptsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the receipts" className="mx-auto w-full max-w-[640px] px-4 pt-6 pb-8 lg:max-w-none lg:px-8">
      <Skeleton className="h-6 w-3/4 bg-paper" />
      <div className="mt-[18px] grid grid-cols-2 gap-3 lg:mt-12 lg:grid-cols-3 lg:gap-4 min-[1700px]:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[104px] rounded-[18px] border-[2.5px] border-ink bg-paper lg:h-[130px] lg:rounded-[22px]" />
        ))}
      </div>
      <div className="mt-[22px] h-[200px] rounded-[22px] border-[3px] border-ink bg-paper lg:mt-12" />
      <div className="mt-[22px] flex flex-col gap-[22px] lg:flex-row lg:gap-7">
        <div className="h-[600px] rounded-[22px] border-[3px] border-ink bg-paper p-6 lg:flex-1">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="mt-5 h-8 bg-canvas" />
          ))}
        </div>
        <div className="h-[420px] rounded-[22px] border-[3px] border-ink bg-ink lg:w-[432px]" />
      </div>
    </div>
  );
}
