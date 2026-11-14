import { notFound } from "next/navigation";
import { Suspense } from "react";

import type { DirectorLineView } from "@/features/director";
import { getDirectorLines } from "@/features/director/server";
import { RobotProfileScreen, RobotProfileSkeleton, type ProfileLine } from "@/features/robot-profile";
import { loadRobotProfile } from "@/features/robot-profile/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../../_shell/app-header";

export const metadata = { title: "Robot · The Cut" };

type Params = Promise<{ id: string }>;

const toLine = (line: DirectorLineView): ProfileLine => ({
  id: line.id,
  text: line.text,
  createdAt: line.createdAt,
  signed: line.proof.status === "verified" || line.proof.status === "partial",
  href: line.proof.verifierUrl ?? line.proof.proofUrl,
});

// One robot's page: pile, savers, its own NEAR account, its posts and where it stands (Profile.dc.html).
export default function RobotPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <>
          <AppHeader title="Robot" />
          <RobotProfileSkeleton />
        </>
      }
    >
      <Robot params={params} />
    </Suspense>
  );
}

async function Robot({ params }: { params: Params }) {
  const { id } = await params;
  const data = await loadRobotProfile(decodeURIComponent(id), await getViewerAccountId());
  if (!data) notFound();
  const [posts, lines] = await Promise.all([
    getDirectorLines({ kinds: ["robot-post"], subjectId: data.robot.id, limit: 3 }),
    getDirectorLines({ kinds: ["scheduled", "final-hour", "after-cut-roast"], subjectId: data.robot.id, limit: 1 }),
  ]);
  const { robot, standing } = data;
  const place = standing.place === "stage" ? `#${standing.rank} of ${standing.of} by pile` : standing.place === "bench" ? "on the bench" : "deleted";
  return (
    <>
      <AppHeader title={robot.name} sub={`${robot.kind}${robot.xHandle ? ` · ${robot.xHandle} on X` : ""} · ${place}`} />
      <RobotProfileScreen data={data} posts={posts.map(toLine)} directorLine={lines[0] ? toLine(lines[0]) : null} />
    </>
  );
}
