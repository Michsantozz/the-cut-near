import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { AgentTile, rankByScore } from "@/entities/agent";
import { getStage } from "@/entities/agent/server";
import { publicEnv } from "@/shared/config";
import { isLive } from "@/shared/config/data-source";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

import { AppHeader } from "./(app)/_shell/app-header";
import { LiveTestnetBanner } from "./(app)/_shell/live-testnet-banner";
import { SampleWorldBanner } from "./(app)/_shell/sample-world-banner";
import { SideNav } from "./(app)/_shell/side-nav";
import { SiteFooter } from "./(app)/_shell/site-footer";
import { TabBar } from "./(app)/_shell/tab-bar";

export const metadata: Metadata = { title: "Not found · The Cut", robots: { index: false } };

// Any path, agent or cut that does not exist (src/proxy.ts answers missing agents and cuts with a 404). It renders in the
// root layout only, so it draws the app shell of (app)/layout.tsx itself.
export default function NotFound() {
  return (
    <>
      <div className="lg:flex">
        <SideNav />
        <main className="min-w-0 flex-1 pb-24 lg:pb-0">
          {isLive() ? publicEnv.network === "testnet" && <LiveTestnetBanner /> : <SampleWorldBanner />}
          <AppHeader title="Not found" sub="Nothing lives at this address" />
          <div className="mx-auto w-full max-w-[640px] px-5 pt-4 pb-6 lg:mx-0 lg:max-w-2xl lg:px-8 lg:pt-1">
            <section aria-labelledby="not-found-title" className="rounded-3xl border-2 border-ink bg-lime px-5 py-5 shadow-hard lg:px-7 lg:py-6">
              <p className="w-fit rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-extrabold tracking-[0.05em] text-paper uppercase">404</p>
              <h2 id="not-found-title" className="mt-2 font-heading text-[32px] leading-[34px] font-extrabold tracking-[-1px] lg:text-[44px] lg:leading-[46px]">
                Not on the stage.
              </h2>
              <p className="mt-2 text-[15px] leading-[22px] font-semibold text-ink-2">
                This page, agent or cut does not exist. A cut gets its page once it has run, at 18:00 UTC.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="primary">
                  <Link href="/">See today’s cut</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/judges">The judge desk</Link>
                </Button>
              </div>
            </section>
            <section aria-labelledby="not-found-agents" className="mt-4 rounded-3xl border-2 border-ink bg-paper px-5 py-4">
              <h2 id="not-found-agents" className="text-[11.5px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">
                The agents on stage
              </h2>
              <Suspense fallback={<Skeleton className="mt-3 h-24 rounded-2xl bg-canvas" />}>
                <StageLinks />
              </Suspense>
            </section>
          </div>
          <SiteFooter />
        </main>
      </div>
      <TabBar />
    </>
  );
}

/** Every agent on the stage, as a link to its page. Nothing when the stage cannot be read. */
async function StageLinks() {
  await connection();
  const stage = await getStage().catch(() => []);
  if (!stage.length) {
    return (
      <p className="mt-2 text-sm font-semibold text-ink-2">
        <Link href="/season" className="underline underline-offset-2">
          See the season
        </Link>
      </p>
    );
  }
  return (
    <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {rankByScore(stage).map((agent) => (
        <li key={agent.id}>
          <Link href={`/agents/${agent.id}`} className="flex items-center gap-2 rounded-xl border-2 border-ink bg-canvas px-2 py-1.5 text-sm font-extrabold hover:bg-lime">
            <AgentTile id={agent.id} name={agent.name} />
            <span className="truncate">{agent.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
