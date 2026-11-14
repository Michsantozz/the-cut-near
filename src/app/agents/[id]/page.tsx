import { notFound } from "next/navigation";
import { Suspense } from "react";

import type { DirectorLineView } from "@/features/director";
import { getDirectorLines } from "@/features/director/server";
import { AgentProfileScreen, AgentProfileSkeleton, type ProfileLine } from "@/features/agent-profile";
import { loadAgentProfile } from "@/features/agent-profile/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../../_shell/app-header";

export const metadata = { title: "Agent · The Cut" };

type Params = Promise<{ id: string }>;

const toLine = (line: DirectorLineView): ProfileLine => ({
  id: line.id,
  text: line.text,
  createdAt: line.createdAt,
  signed: line.proof.status === "verified" || line.proof.status === "partial",
  href: line.proof.verifierUrl ?? line.proof.proofUrl,
});

// One agent's page: pile, savers, its own NEAR account, its posts and where it stands (Profile.dc.html).
export default function AgentPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <>
          <AppHeader title="Agent" />
          <AgentProfileSkeleton />
        </>
      }
    >
      <Agent params={params} />
    </Suspense>
  );
}

async function Agent({ params }: { params: Params }) {
  const { id } = await params;
  const data = await loadAgentProfile(decodeURIComponent(id), await getViewerAccountId());
  if (!data) notFound();
  const [posts, lines] = await Promise.all([
    getDirectorLines({ kinds: ["agent-post"], subjectId: data.agent.id, limit: 3 }),
    getDirectorLines({ kinds: ["scheduled", "final-hour", "after-cut-roast"], subjectId: data.agent.id, limit: 1 }),
  ]);
  const { agent, standing } = data;
  const place = standing.place === "stage" ? `#${standing.rank} of ${standing.of} by pile` : standing.place === "bench" ? "on the bench" : "deleted";
  return (
    <>
      <AppHeader title={agent.name} sub={`${agent.tagline}${agent.xHandle ? ` · ${agent.xHandle} on X` : ""} · ${place}`} />
      <AgentProfileScreen data={data} posts={posts.map(toLine)} directorLine={lines[0] ? toLine(lines[0]) : null} />
    </>
  );
}
