import { Suspense } from "react";

import { DirectorScreen } from "@/features/director";
import { loadDirectorScreen } from "@/features/director/server";
import { Skeleton } from "@/shared/ui/skeleton";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Director · The Cut" };

const TITLE = "The Director";
const SUB = "The math picks. The AI narrates.";

// The cut as a show: the countdown, who is on the block, the cut itself (anyone runs it) and every signed line.
export default function DirectorPage() {
  return (
    <>
      <AppHeader title={TITLE} sub={SUB} />
      <Suspense fallback={<DirectorSkeleton />}>
        <Director />
      </Suspense>
    </>
  );
}

async function Director() {
  return <DirectorScreen screen={await loadDirectorScreen()} />;
}

function DirectorSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-4 pb-6 lg:max-w-none lg:gap-5 lg:px-8 lg:pt-1" aria-busy="true">
      <Skeleton className="h-[120px] rounded-3xl bg-paper lg:h-[290px]" />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <Skeleton className="h-[260px] rounded-3xl bg-paper lg:h-[300px]" />
        <Skeleton className="h-[200px] rounded-3xl bg-paper lg:h-[300px]" />
      </div>
    </div>
  );
}
