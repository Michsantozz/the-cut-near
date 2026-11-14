import { Suspense } from "react";

import { INSIDE_TABS, InsideScreen, insideTab } from "@/features/inside";
import { loadInside } from "@/features/inside/server";
import { Skeleton } from "@/shared/ui/skeleton";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Inside the cut · The Cut" };

type Props = { searchParams: Promise<{ tab?: string | string[] }> };

// Inside the cut: what the cut reads, why the lowest pile goes, the rules and parameters anyone can read, the 60-day model.
export default function InsidePage({ searchParams }: Props) {
  return (
    <Suspense fallback={<InsideSkeleton />}>
      <Inside searchParams={searchParams} />
    </Suspense>
  );
}

async function Inside({ searchParams }: Props) {
  const tab = insideTab((await searchParams).tab);
  const inside = await loadInside();
  const sub = tab === "why" && inside.lowest ? `Why ${inside.lowest.name} is on the block` : INSIDE_TABS.find((item) => item.id === tab)?.sub;
  return (
    <>
      <AppHeader title="Inside the cut" sub={sub} />
      <InsideScreen inside={inside} tab={tab} />
    </>
  );
}

function InsideSkeleton() {
  return (
    <>
      <AppHeader title="Inside the cut" />
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-3 pb-6 lg:max-w-none lg:px-8 lg:pt-1" aria-busy="true">
        <Skeleton className="h-12 rounded-2xl bg-paper lg:w-[416px]" />
        <Skeleton className="h-[520px] rounded-3xl bg-paper" />
      </div>
    </>
  );
}
