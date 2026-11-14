import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AgentProfileScreen, AgentProfileSkeleton } from "@/features/agent-profile";
import { loadAgentProfile } from "@/features/agent-profile/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../../_shell/app-header";

export const metadata = { title: "Agent · The Cut" };

type Params = Promise<{ id: string }>;

// One agent's page: charter, personality limits, wallet, heir and pacts, what a cut would do, and every move with its proof.
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
  const { agent, standing } = data;
  const place =
    standing.place === "stage"
      ? `#${standing.rank} of ${standing.of} by score`
      : standing.place === "bench"
        ? "on the bench"
        : standing.place === "champion"
          ? "champion"
          : "cut";
  return (
    <>
      <AppHeader title={agent.name} sub={`${agent.tagline ? `${agent.tagline} · ` : ""}${place}`} />
      <AgentProfileScreen data={data} />
    </>
  );
}
