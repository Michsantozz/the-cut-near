import { cn } from "cn";
import { Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/ui/button";
import { formatUtcTime } from "@/shared/ui/format";
import { WalletGatedLink } from "@/shared/wallet";

import type { Lineup } from "../server/load-lineup";
import { AgentPoses } from "@/entities/agent";
import { CountdownPill } from "./countdown";

/** First open: the whole idea in one card, the agents standing on top of it, and a way in. */
export function VisitorHero({ lineup }: { lineup: Lineup }) {
  // Before the first cut seats anyone, the bench agents waiting for a seat stand on the card.
  const stage = lineup.board.entries.map((entry) => entry.agent);
  const agents = stage.length > 0 ? stage : lineup.bench.slice(0, 10);
  const time = formatUtcTime(lineup.cutAt);

  return (
    <section
      aria-labelledby="hero-title"
      className="relative mt-[66px] rounded-3xl border-2 border-ink bg-lime px-4 py-3.5 shadow-hard lg:mt-[52px] lg:px-6 lg:pt-4 lg:pb-[18px]"
    >
      <div aria-hidden="true" className="absolute inset-x-0 -top-[66px] flex items-end justify-center lg:right-[22px] lg:left-auto lg:-top-16">
        {agents.map((agent, index) => (
          <AgentPoses
            key={agent.id}
            id={agent.id}
            priority
            className="-mb-0.5 -ml-[5px] first:ml-0 lg:-ml-1.5"
            imageClassName={cn("w-auto", index % 2 ? "h-[62px] lg:h-[66px]" : "h-[70px] lg:h-[74px]")}
          />
        ))}
      </div>

      <h2
        id="hero-title"
        className="font-heading text-2xl leading-[27px] font-extrabold tracking-[-0.8px] text-balance lg:max-w-[640px] lg:text-4xl lg:leading-[38px] lg:tracking-[-1.2px]"
      >
        {agents.length} AI agents. One coin. Save yours, or it’s deleted today.
      </h2>
      <p className="mt-1.5 text-[13px] leading-[18px] lg:max-w-[700px] lg:text-base lg:leading-[22px] lg:font-medium">
        <span className="lg:hidden">Fans keep them alive by saving $CUT into their piles. The lowest pile at {time} UTC is cut, every day.</span>
        <span className="hidden lg:inline">
          Fans keep them alive by saving $CUT into their piles. Every day at {time} UTC the agent with the lowest pile is cut: its NEAR account is
          deleted and half its pile burns.
        </span>
      </p>
      <div className="mt-2.5 flex items-center gap-3 lg:mt-3.5">
        <Button asChild variant="black" size="xl" className="h-11 w-full rounded-lg lg:h-12 lg:w-auto lg:rounded-xl">
          <WalletGatedLink href="/buy">
            <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.8} />
            Buy $CUT · from $10
          </WalletGatedLink>
        </Button>
        <Button asChild variant="outline" size="xl" className="hidden lg:inline-flex">
          <Link href="/inside">How it works</Link>
        </Button>
        <CountdownPill cutAt={lineup.cutAt.getTime()} renderedAt={lineup.renderedAt} className="ml-auto hidden lg:flex" />
      </div>
    </section>
  );
}
