import { cn } from "cn";
import { ArrowUpRight, ChevronLeft, Clock, Gift, Heart, Minus, Plus, Scissors, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/ui/button";
import { formatUtcDate } from "@/shared/ui/format";
import { ConnectButton, WalletGatedLink } from "@/shared/wallet";

import type { DayCell } from "../model/days";
import { ACTIVITY_FILTER_LABELS, ACTIVITY_FILTERS, type ActivityFilter, type ActivityKind } from "../model/rows";
import type { Activity } from "../server/load-activity";

// Activity (Activity.dc.html, DeskActivity.dc.html): the viewer's moves, each with its receipt on NEAR.

const KIND: Record<ActivityKind, { bg: string; icon: LucideIcon }> = {
  buy: { bg: "bg-[#ffd84d]", icon: Plus },
  sell: { bg: "bg-orange", icon: Minus },
  save: { bg: "bg-pink", icon: Heart },
  prize: { bg: "bg-lime", icon: Gift },
  cut: { bg: "bg-violet", icon: Scissors },
};

function KindIcon({ kind, className, iconClass }: { kind: ActivityKind; className: string; iconClass: string }) {
  const { bg, icon: Icon } = KIND[kind];
  return (
    <span aria-hidden="true" className={cn("flex shrink-0 items-center justify-center border-2 border-ink", bg, className)}>
      <Icon className={iconClass} strokeWidth={2.6} />
    </span>
  );
}

const href = (filter: ActivityFilter) => (filter === "all" ? "/activity" : `/activity?filter=${filter}`);

function Filters({ current }: { current: ActivityFilter }) {
  return (
    <nav aria-label="Filter your activity" className="flex gap-1.5 overflow-x-auto lg:gap-2">
      {ACTIVITY_FILTERS.map((id) => (
        <Link
          key={id}
          href={href(id)}
          scroll={false}
          aria-current={id === current ? "page" : undefined}
          className={cn(
            "inline-flex h-[34px] shrink-0 items-center rounded-full border-2 border-ink px-2.5 text-[12.5px] font-bold whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:px-3.5 lg:text-[13.5px]",
            id === current ? "bg-ink text-paper" : "bg-paper hover:bg-canvas",
          )}
        >
          {ACTIVITY_FILTER_LABELS[id]}
        </Link>
      ))}
    </nav>
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
      <h2 className="font-heading text-xl font-extrabold">Activity</h2>
      <span className="w-11" />
    </div>
  );
}

export function ActivityScreen({ data }: { data: Activity }) {
  if (!data.hasAny) return <EmptyActivity />;
  return (
    <>
      <PhoneTitle />
      {/* Phone: grouped by day */}
      <div className="mx-auto max-w-[640px] pb-6 lg:hidden">
        <div className="mx-5 mt-3.5">
          <Filters current={data.filter} />
        </div>
        {data.groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h3 className="mx-6 mt-3 mb-[5px] text-xs font-bold tracking-[0.5px] text-ink-3">{group.label}</h3>
            <ul className="mx-5 rounded-[18px] border-2 border-ink bg-paper px-3">
              {group.rows.map((row, i) => (
                <li key={row.key} className={cn("h-[52px]", i > 0 && "border-t-[1.5px] border-canvas")}>
                  <a href={row.href} target="_blank" rel="noopener noreferrer" className="flex h-full items-center gap-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                    <KindIcon kind={row.kind} className="size-8 rounded-[10px]" iconClass="size-4" />
                    <span className="min-w-0 grow">
                      <span className="block truncate text-sm font-bold">{row.title}</span>
                      <span className="block truncate text-[12.5px] text-ink-3">{row.sub}</span>
                    </span>
                    <span className={cn("text-sm font-bold whitespace-nowrap", row.auto && "text-ink-3")}>{row.amount}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {data.rows.length === 0 && <p className="mx-5 mt-6 text-center text-sm text-ink-3">Nothing of this kind yet.</p>}
        <p className="mt-3.5 text-center">
          <a href={data.explorerHref} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold underline">
            See every receipt on NEAR
          </a>
        </p>
      </div>

      {/* Laptop: the day strip, then a table */}
      <div className="hidden flex-col gap-4 px-8 pt-1 pb-7 lg:flex">
        <section aria-labelledby="days-title" className="rounded-[22px] border-2 border-ink bg-paper px-5 pt-4 pb-5 shadow-hard">
          <div className="flex items-baseline gap-3">
            <h2 id="days-title" className="font-heading text-[22px] font-extrabold">
              Day {data.dayNumber}
            </h2>
            <p className="text-[13.5px] font-semibold text-ink-3">
              {data.launchedAt ? `Launched ${formatUtcDate(data.launchedAt)} · ` : ""}a cut every day at 18:00 UTC
            </p>
          </div>
          <ol className="mt-3 grid grid-cols-8 gap-2.5">
            {data.days.map((day) => (
              <DayBox key={day.key} day={day} />
            ))}
          </ol>
        </section>
        <section aria-label="Activity" className="rounded-[22px] border-2 border-ink bg-paper px-5 pt-3.5 pb-2 shadow-hard">
          <div className="flex items-center gap-2">
            <Filters current={data.filter} />
            <a href={data.explorerHref} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-[13.5px] font-bold underline underline-offset-2">
              See every receipt on NEAR
              <ArrowUpRight aria-hidden="true" className="size-3.5" strokeWidth={2.8} />
            </a>
          </div>
          <table className="mt-2.5 w-full table-fixed">
            <thead>
              <tr className="h-[34px] border-b-2 border-ink text-left text-[11px] font-extrabold tracking-[0.6px] text-ink-3">
                <th className="w-[140px] font-extrabold">DATE</th>
                <th className="w-[310px] font-extrabold">WHAT HAPPENED</th>
                <th className="font-extrabold">DETAILS</th>
                <th className="w-[140px] text-right font-extrabold">AMOUNT</th>
                <th className="w-[140px] text-right font-extrabold">RECEIPT</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={row.key} className={cn("h-16", i > 0 && "border-t-[1.5px] border-canvas")}>
                  <td className={cn("text-sm font-semibold whitespace-nowrap", i > 0 && data.rows[i - 1].at.toISOString().slice(0, 10) === row.at.toISOString().slice(0, 10) ? "text-ink-4" : "")}>
                    {formatUtcDate(row.at)}
                  </td>
                  <td>
                    <span className="flex min-w-0 items-center gap-3">
                      <KindIcon kind={row.kind} className="size-9 rounded-[11px]" iconClass="size-[17px]" />
                      <span className="truncate text-[15px] font-bold">{row.title}</span>
                    </span>
                  </td>
                  <td className="truncate pl-5 text-sm text-ink-3">{row.sub}</td>
                  <td className={cn("text-right font-heading text-lg font-extrabold whitespace-nowrap", row.auto && "text-ink-3")}>{row.amount}</td>
                  <td className="text-right">
                    <a
                      href={row.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-[30px] items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-[11px] text-xs font-extrabold hover:bg-canvas"
                    >
                      Receipt
                      <ArrowUpRight aria-hidden="true" className="size-3" strokeWidth={3} />
                    </a>
                  </td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-ink-3">
                    Nothing of this kind yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function DayBox({ day }: { day: DayCell }) {
  return (
    <li
      className={cn(
        "h-[148px] rounded-2xl border-2 px-[9px] pt-2.5",
        day.state === "today" ? "border-ink bg-lime" : day.state === "past" ? "border-ink bg-paper" : "border-dashed border-ink-4/60 bg-paper",
      )}
    >
      <div className="flex items-baseline justify-between">
        <span className={cn("text-[11px] font-extrabold tracking-[0.6px]", day.state === "future" ? "text-ink-3" : "")}>{day.weekday}</span>
        {day.tag && <span className="text-[10.5px] font-extrabold tracking-[0.4px]">{day.tag}</span>}
      </div>
      <p className={cn("font-heading text-[26px] leading-[30px] font-extrabold", day.state === "future" ? "text-ink-3" : "")}>{day.day}</p>
      <ul className="mt-2 flex flex-col gap-[5px]">
        {day.chips.map((chip) => {
          const { bg, icon: Icon } = KIND[chip.kind];
          return (
            <li key={chip.label} className={cn("flex items-center gap-[5px] text-xs font-bold whitespace-nowrap", chip.ahead && "opacity-55")}>
              <span aria-hidden="true" className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border-[1.5px] border-ink", chip.kind === "cut" ? "bg-violet-soft" : bg)}>
                <Icon className="size-3" strokeWidth={3} />
              </span>
              {chip.label}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function EmptyBody({ action }: { action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-9 pt-[120px] text-center lg:w-[400px] lg:shrink-0 lg:items-start lg:p-0 lg:text-left">
      <span aria-hidden="true" className="flex size-24 -rotate-[4deg] items-center justify-center rounded-[28px] border-2 border-ink bg-sky shadow-hard">
        <Clock className="size-11" strokeWidth={2.4} />
      </span>
      <h2 className="mt-[22px] font-heading text-[28px] leading-[31px] font-extrabold tracking-[-0.5px] lg:mt-6 lg:text-[38px] lg:leading-[42px] lg:tracking-[-1px]">Nothing here yet</h2>
      <p className="mt-2 text-[14.5px] leading-[21px] text-ink-3 lg:mt-2.5 lg:text-base lg:leading-6">
        Your buys, sells, saves, prizes and every daily cut show here, each with a receipt on NEAR.
      </p>
      {action}
    </div>
  );
}

const GHOSTS: { kind: ActivityKind; label: string; w1: string; w2: string }[] = [
  { kind: "buy", label: "Buys", w1: "62%", w2: "40%" },
  { kind: "save", label: "Saves", w1: "54%", w2: "34%" },
  { kind: "cut", label: "Cuts", w1: "70%", w2: "46%" },
  { kind: "prize", label: "Prizes", w1: "48%", w2: "30%" },
];

function EmptyLayout({ action }: { action: React.ReactNode }) {
  return (
    <>
      <PhoneTitle />
      <div className="lg:px-8 lg:pt-1 lg:pb-7">
        <section aria-label="Activity" className="lg:flex lg:items-center lg:gap-12 lg:rounded-[22px] lg:border-2 lg:border-ink lg:bg-paper lg:px-12 lg:py-11 lg:shadow-hard">
          <EmptyBody action={action} />
          <ul aria-hidden="true" className="hidden min-w-0 grow rounded-[20px] border-2 border-dashed border-[#b9bfcc] bg-[#f6f8fb] px-5 py-1.5 lg:block">
            {GHOSTS.map((g, i) => (
              <li key={g.label} className={cn("flex h-[70px] items-center gap-3.5", i > 0 && "border-t-[1.5px] border-line")}>
                <KindIcon kind={g.kind} className="size-9 rounded-[11px]" iconClass="size-[17px]" />
                <span className="w-[110px] text-[15px] font-bold">{g.label}</span>
                <span className="flex grow flex-col gap-[7px]">
                  <span className="h-2.5 rounded-[5px] bg-line-2" style={{ width: g.w1 }} />
                  <span className="h-2 rounded-[4px] bg-line" style={{ width: g.w2 }} />
                </span>
                <span className="h-3 w-[70px] rounded-md bg-line-2" />
                <span className="inline-flex h-7 items-center rounded-full border-2 border-[#b9bfcc] bg-paper px-[11px] text-xs font-extrabold text-[#9aa0ae]">Receipt</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

/** A connected account with no moves yet. */
function EmptyActivity() {
  return (
    <EmptyLayout
      action={
        <Button asChild variant="primary" elevated className="mt-6 h-[54px] w-full rounded-xl text-base lg:w-auto lg:px-7">
          <WalletGatedLink href="/buy">
            <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.8} />
            Buy $CUT
          </WalletGatedLink>
        </Button>
      }
    />
  );
}

/** A visitor: the same page, asking to connect a wallet first. */
export function ActivityVisitor() {
  return (
    <EmptyLayout
      action={
        <ConnectButton elevated className="mt-6 h-[54px] w-full rounded-xl text-base lg:w-auto lg:px-7">
          Connect a wallet to see yours
        </ConnectButton>
      }
    />
  );
}
