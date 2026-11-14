import { Suspense } from "react";

import { LineupScreen, LineupSkeleton, lineupSubtitle } from "@/features/lineup";
import { loadLineup } from "@/features/lineup/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "./_shell/app-header";

// The main screen: today's cut (SPEC-v20 "The day"), for a visitor or a member.
export default function LineupPage() {
  return (
    <Suspense
      fallback={
        <>
          <AppHeader title="Today’s cut" />
          <LineupSkeleton />
        </>
      }
    >
      <Lineup />
    </Suspense>
  );
}

async function Lineup() {
  const lineup = await loadLineup(await getViewerAccountId());
  return (
    <>
      <AppHeader title="Today’s cut" sub={lineupSubtitle(lineup)} />
      <LineupScreen lineup={lineup} />
    </>
  );
}
