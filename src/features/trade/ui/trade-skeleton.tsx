import { Skeleton } from "@/shared/ui/skeleton";

/** Placeholder while a trade step loads its quote and balances. */
export function TradeSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="px-5 pt-[18px] lg:fixed lg:inset-0 lg:z-50 lg:flex lg:items-center lg:justify-center lg:bg-scrim">
      <div className="mx-auto w-full max-w-[640px] lg:h-[460px] lg:w-[936px] lg:max-w-none lg:rounded-[28px] lg:border-2 lg:border-ink lg:bg-paper lg:p-[30px]">
        <Skeleton className="h-11 w-11 rounded-[14px] bg-paper lg:hidden" />
        <Skeleton className="mx-auto mt-6 h-16 w-48 bg-paper lg:mx-0 lg:mt-0 lg:h-10 lg:w-56 lg:bg-canvas" />
        <Skeleton className="mt-6 h-40 w-full rounded-3xl bg-paper lg:bg-canvas" />
      </div>
    </div>
  );
}
