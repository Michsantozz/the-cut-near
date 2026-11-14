import { Skeleton } from "@/shared/ui/skeleton";

/** First paint while the agent is read from NEAR. */
export function AgentProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the agent" className="lg:flex lg:gap-6 lg:px-8 lg:pt-1">
      <div className="h-[155px] border-b-2 border-ink bg-paper lg:h-[620px] lg:w-[390px] lg:rounded-[26px] lg:border-2" />
      <div className="flex grow flex-col gap-3 px-5 pt-3 lg:px-0 lg:pt-0">
        <Skeleton className="h-8 w-48 bg-paper" />
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-4 lg:gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[62px] rounded-xl border-2 border-ink bg-paper last:hidden lg:h-[82px] lg:rounded-[18px] lg:last:block" />
          ))}
        </div>
        <div className="h-[260px] rounded-[20px] border-2 border-ink bg-paper" />
      </div>
    </div>
  );
}
