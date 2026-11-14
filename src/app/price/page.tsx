import { Suspense } from "react";

import type { PriceRange } from "@/entities/market";
import { ValueScreen, valueSubtitle } from "@/features/trade";
import { loadValue } from "@/features/trade/server";
import { Skeleton } from "@/shared/ui/skeleton";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "$CUT price · The Cut" };

const RANGES: readonly PriceRange[] = ["day", "week", "all"];

export default function PricePage({ searchParams }: PageProps<"/price">) {
  return (
    <Suspense
      fallback={
        <>
          <div className="hidden lg:block">
            <AppHeader title="$CUT price" />
          </div>
          <div className="px-5 pt-[18px] lg:px-8">
            <Skeleton className="h-[460px] w-full rounded-3xl bg-paper" />
          </div>
        </>
      }
    >
      <Price searchParams={searchParams} />
    </Suspense>
  );
}

async function Price({ searchParams }: Pick<PageProps<"/price">, "searchParams">) {
  const { range } = await searchParams;
  const picked = RANGES.find((r) => r === range) ?? "week";
  const data = await loadValue(await getViewerAccountId(), picked);
  return (
    <>
      <div className="hidden lg:block">
        <AppHeader title="$CUT price" sub={valueSubtitle(data)} />
      </div>
      <ValueScreen data={data} />
    </>
  );
}
