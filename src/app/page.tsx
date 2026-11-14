import { Suspense } from "react";

import { proofBadge } from "@/features/director";
import { getDirectorLines } from "@/features/director/server";
import { LineupScreen, LineupSkeleton, lineupSubtitle } from "@/features/lineup";
import { loadLineup } from "@/features/lineup/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "./_shell/app-header";

// The main screen: today's cut (SPEC-v19 §6), for a visitor or a member.
export default function LineupPage() {
  return (
    <Suspense
      fallback={
        <>
          <AppHeader title="The lineup" />
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
  // The Director card reads `directorLine`: the Director is its own feature, so the route composes them.
  const withDirector = { ...lineup, directorLine: await latestBlockLine(lineup.board.lowest?.id) };
  return (
    <>
      <AppHeader title="The lineup" sub={lineupSubtitle(lineup)} />
      <LineupScreen lineup={withDirector} />
    </>
  );
}

/** The Director's newest line about the robot on the block (the Final hour line, else the day's line), with its proof. */
async function latestBlockLine(lowestId: string | undefined) {
  if (!lowestId) return null;
  const [line] = await getDirectorLines({ kinds: ["final-hour", "scheduled"], subjectId: lowestId, limit: 1 });
  return line ? { text: line.text, badge: proofBadge(line.proof.status).label, proofUrl: line.proof.proofUrl } : null;
}
