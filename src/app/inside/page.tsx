import { Suspense } from "react";

import { InsideScreen } from "@/features/inside";
import { loadInside } from "@/features/inside/server";
import { Skeleton } from "@/shared/ui/skeleton";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Inside the cut · The Cut" };

// Inside the cut: the rules (docs/design/SPEC-v20.md) in plain words, where the $CUT goes, the parameters and the known limits.
export default function InsidePage() {
  return (
    <>
      <AppHeader title="Inside the cut" sub="The rules, where the $CUT goes, and what can still go wrong" />
      <Suspense fallback={<InsideSkeleton />}>
        <Inside />
      </Suspense>
    </>
  );
}

async function Inside() {
  return <InsideScreen inside={await loadInside()} />;
}

function InsideSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-3 pb-6 lg:max-w-none lg:px-8 lg:pt-1" aria-busy="true">
      <Skeleton className="h-40 rounded-3xl bg-paper" />
      <Skeleton className="h-[520px] rounded-3xl bg-paper" />
    </div>
  );
}
