import { Lock, TrendingUp } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/ui/button";
import { formatUsd, formatUtcTime } from "@/shared/ui/format";
import { WalletGatedLink } from "@/shared/wallet";

import type { LineupMember } from "../server/load-lineup";
import { cutFine } from "./copy";

/** What the member holds and what it saved on whom. Kept small so the cut stays the first thing on screen. */
export function MemberCard({ member, cutAt }: { member: LineupMember; cutAt: Date }) {
  const { balance, valueUsdCents, saves, savedTotal } = member;
  const locked = `locked till ${formatUtcTime(cutAt)} UTC`;
  const savedLine =
    saves.length === 1
      ? { bold: `${cutFine(saves[0].amount)} saved on ${saves[0].agentName}`, href: `/agents/${saves[0].agentId}` }
      : saves.length > 1
        ? { bold: `${cutFine(savedTotal)} saved on ${saves.length} agents`, href: "/activity" }
        : null;

  return (
    <section
      aria-label="Your $CUT"
      className="rounded-2xl border-2 border-ink bg-paper pt-1.5 pr-2.5 pb-2 pl-3.5 shadow-hard-sm lg:w-[372px] lg:shrink-0 lg:rounded-3xl lg:pt-3 lg:pr-3.5 lg:pb-3.5 lg:pl-[18px] lg:shadow-hard"
    >
      <div className="flex h-[30px] items-center justify-between gap-2 lg:h-auto lg:gap-2.5">
        <div className="flex min-w-0 items-baseline gap-[7px] whitespace-nowrap lg:block">
          {balance !== null && <p className="hidden text-[13px] font-semibold text-ink-3 lg:block">Your {cutFine(balance)} $CUT</p>}
          <p className="truncate font-heading text-2xl leading-[30px] font-extrabold tracking-[-0.8px] lg:text-[32px] lg:leading-9 lg:tracking-[-1px]">
            {valueUsdCents !== null ? formatUsd(valueUsdCents) : member.accountId}
          </p>
          {balance !== null && <p className="text-xs font-semibold text-ink-3 lg:hidden">{cutFine(balance)} $CUT</p>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button asChild variant="soft" size="sm" className="text-xs font-bold lg:h-[38px] lg:rounded-[13px] lg:bg-paper lg:px-3.5 lg:text-sm lg:font-extrabold">
            <Link href="/price">
              <TrendingUp aria-hidden="true" className="hidden lg:block" strokeWidth={2.6} />
              Price
            </Link>
          </Button>
          <Button asChild variant="soft" size="sm" className="text-xs font-bold lg:hidden">
            <WalletGatedLink href="/sell">Sell</WalletGatedLink>
          </Button>
        </div>
      </div>
      {savedLine ? (
        <Link
          href={savedLine.href}
          className="mt-1.5 flex h-7 w-full items-center gap-1.5 rounded-sm border-2 border-ink bg-lime-soft pr-1.5 pl-2.5 text-[12.5px] font-semibold whitespace-nowrap normal-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:mt-2 lg:h-[34px] lg:gap-[7px] lg:rounded-[11px] lg:pr-2.5"
        >
          <Lock aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.6} />
          <span className="truncate">
            <b className="font-extrabold">{savedLine.bold}</b> · {locked}
          </span>
        </Link>
      ) : (
        <p className="mt-1.5 flex h-7 items-center rounded-sm bg-canvas px-2.5 text-[12.5px] font-semibold text-ink-3 lg:mt-2 lg:h-[34px]">
          Nothing saved yet. Saves stay {locked}.
        </p>
      )}
    </section>
  );
}
