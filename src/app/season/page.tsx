import { Suspense } from "react";

import { SeasonScreen, seasonSubtitle } from "@/features/season";
import { loadSeason } from "@/features/season/server";
import { Skeleton } from "@/shared/ui/skeleton";

import { AppHeader } from "../_shell/app-header";

export const metadata = { title: "Season · The Cut" };

// The season: day, pot, the shrinking stage, the crown and the bench for the next season.
export default function SeasonPage({ searchParams }: PageProps<"/season">) {
  return (
    <Suspense
      fallback={
        <>
          <AppHeader title="Season" />
          <Skeleton className="mx-4 mt-2 h-[560px] rounded-3xl bg-paper lg:mx-8" />
        </>
      }
    >
      <Season searchParams={searchParams} />
    </Suspense>
  );
}

async function Season({ searchParams }: Pick<PageProps<"/season">, "searchParams">) {
  const { preview } = await searchParams;
  const page = await loadSeason({ preview: preview === "crowned" });
  return (
    <>
      <AppHeader title={`Season ${page.season.index}`} sub={seasonSubtitle(page)} />
      <SeasonScreen page={page} />
    </>
  );
}
