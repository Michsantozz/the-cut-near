import { cn } from "cn";
import { Bell, Check, ChevronLeft, Clock, Gift, Scissors, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/ui/button";
import { ConnectButton } from "@/shared/wallet";

import type { NoticeKind } from "../model/inbox";
import type { Inbox, InboxNotice } from "../server/load-inbox";

// Notifications (Notifications.dc.html "inbox", DeskNotifications.dc.html): new first, then earlier.

const KIND: Record<NoticeKind, { bg: string; icon: LucideIcon | "x" }> = {
  danger: { bg: "bg-orange", icon: TriangleAlert },
  post: { bg: "bg-sky", icon: "x" },
  final: { bg: "bg-[#ffd84d]", icon: Clock },
  prize: { bg: "bg-lime", icon: Gift },
  cut: { bg: "bg-violet", icon: Scissors },
  collected: { bg: "bg-lime", icon: Check },
};

function XMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[17px]" fill="currentColor">
      <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L2 3h6.4l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" />
    </svg>
  );
}

function NoticeCard({ notice }: { notice: InboxNotice }) {
  const { bg, icon: Icon } = KIND[notice.kind];
  const body = (
    <>
      <span aria-hidden="true" className={cn("flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border-2 border-ink lg:size-9", bg)}>
        {Icon === "x" ? <XMark /> : <Icon className="size-[17px]" strokeWidth={2.6} />}
      </span>
      <span className="min-w-0 grow">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[14.5px] leading-5 font-extrabold">{notice.title}</span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-ink-3">
            {notice.age}
            {notice.isNew && <span aria-label="new" className="size-2.5 rounded-full border-[1.5px] border-ink bg-blue" />}
          </span>
        </span>
        <span className="mt-0.5 block text-[13.5px] leading-[19px] text-ink-2">{notice.text}</span>
      </span>
    </>
  );
  const className = cn(
    "flex gap-2.5 rounded-[18px] border-2 border-ink px-3 py-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    notice.isNew ? "bg-paper shadow-hard" : "bg-[#f6f8fb]",
  );
  return notice.href ? (
    <Link href={notice.href} className={cn(className, "hover:bg-canvas")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function PhoneTitle() {
  return (
    <div className="flex items-center justify-between px-5 pt-[18px] lg:hidden">
      <Button asChild variant="outline" size="icon" elevated className="size-11 rounded-[14px]">
        <Link href="/" aria-label="Back to the lineup">
          <ChevronLeft className="size-5" strokeWidth={2.6} />
        </Link>
      </Button>
      <h2 className="font-heading text-xl font-extrabold">Notifications</h2>
      <span className="w-11" />
    </div>
  );
}

export function InboxScreen({ inbox }: { inbox: Inbox }) {
  const sections = [
    { label: "NEW", items: inbox.fresh },
    { label: "EARLIER", items: inbox.earlier },
  ].filter((s) => s.items.length > 0);
  return (
    <>
      <PhoneTitle />
      <div className="mx-auto max-w-[640px] px-5 pb-6 lg:mx-0 lg:max-w-[560px] lg:px-8 lg:pt-1">
        <div className="lg:rounded-[26px] lg:border-2 lg:border-ink lg:bg-paper lg:px-4 lg:pt-4 lg:pb-4 lg:shadow-hard-lg">
          <div className="hidden items-center gap-2.5 px-1 lg:flex">
            <h2 className="font-heading text-[22px] font-extrabold">Notifications</h2>
            {inbox.fresh.length > 0 && <span className="rounded-full border-2 border-ink bg-blue px-2 text-[11px] font-extrabold text-paper">{inbox.fresh.length} NEW</span>}
          </div>
          {sections.map((section) => (
            <section key={section.label} aria-label={section.label === "NEW" ? "New" : "Earlier"}>
              <h3 className="mt-4 mb-2 px-1 text-xs font-extrabold tracking-[0.06em] text-ink-3 lg:mt-3.5">{section.label}</h3>
              <ul className="flex flex-col gap-2.5">
                {section.items.map((notice) => (
                  <li key={notice.key}>
                    <NoticeCard notice={notice} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {sections.length === 0 && <p className="mt-6 text-center text-sm text-ink-3">Nothing new.</p>}
        </div>
      </div>
    </>
  );
}

/** A visitor: notifications are about your agents, so connect first. */
export function InboxVisitor() {
  return (
    <>
      <PhoneTitle />
      <div className="flex flex-col items-center px-9 pt-[100px] text-center lg:items-start lg:px-8 lg:pt-4 lg:text-left pb-12 lg:pb-16">
        <span aria-hidden="true" className="flex size-[84px] -rotate-[4deg] items-center justify-center rounded-[26px] border-2 border-ink bg-[#ffd84d] shadow-hard">
          <Bell className="size-10" strokeWidth={2.4} />
        </span>
        <h2 className="mt-6 font-heading text-[30px] leading-[33px] font-extrabold tracking-[-0.6px]">Know before your agent is cut</h2>
        <p className="mt-2 max-w-[420px] text-[15px] leading-[22px] text-ink-3">Connect a wallet to see when your agent is in danger, the Final hour, and prizes ready to collect.</p>
        <ConnectButton elevated className="mt-6 h-[54px] w-full rounded-xl text-base lg:w-auto lg:px-7">
          Connect a wallet
        </ConnectButton>
      </div>
    </>
  );
}
