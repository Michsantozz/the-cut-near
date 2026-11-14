import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AgentProfileScreen, AgentProfileSkeleton } from "@/features/agent-profile";
import { loadAgentProfile } from "@/features/agent-profile/server";
import { getViewerAccountId } from "@/shared/wallet/server";

import { AppHeader } from "../../_shell/app-header";
import { agentDescription, loadAgentCard } from "./agent-card";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  // A missing agent is answered with a 404 by src/proxy.ts before this page renders.
  const card = await loadAgentCard(decodeURIComponent((await params).id));
  if (!card) return { title: "Agent not found · The Cut", robots: { index: false } };
  const title = `${card.name} · The Cut`;
  const description = agentDescription(card);
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

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
