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
  // The Director card reads `directorLine` and the on-the-block card `blockPost`: the Director is its own
  // feature, so the route composes them.
  const lowestId = lineup.board.lowest?.id;
  const [directorLine, blockPost] = await Promise.all([latestBlockLine(lowestId), latestBlockPost(lowestId)]);
  const withDirector = { ...lineup, directorLine, blockPost };
  return (
    <>
      <AppHeader title="The lineup" sub={lineupSubtitle(lineup)} />
      <LineupScreen lineup={withDirector} />
    </>
  );
}

/** The newest post of the agent on the block, in its own voice. */
async function latestBlockPost(lowestId: string | undefined) {
  if (!lowestId) return null;
  const [post] = await getDirectorLines({ kinds: ["agent-post"], subjectId: lowestId, limit: 1 });
  return post ? { text: post.text, badge: proofBadge(post.proof.status).label } : null;
}

/** The Director's newest line about the agent on the block (the Final hour line, else the day's line), with its proof. */
async function latestBlockLine(lowestId: string | undefined) {
  if (!lowestId) return null;
  const [line] = await getDirectorLines({ kinds: ["final-hour", "scheduled"], subjectId: lowestId, limit: 1 });
  return line ? { text: line.text, badge: proofBadge(line.proof.status).label, proofUrl: line.proof.proofUrl } : null;
}
