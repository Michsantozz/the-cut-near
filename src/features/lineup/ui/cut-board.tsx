import { cn } from "cn";
import { ArrowUp, ChartPie } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { formatAmount, formatCount, formatUtcTime } from "@/shared/ui/format";
import { WalletGatedLink } from "@/shared/wallet";

import { barPercent, type BoardEntry } from "../model/board";
import type { Lineup } from "../server/load-lineup";
import { cut, cutFine, rescueLine, SLICE_RULE } from "./copy";
import { AgentTile } from "@/entities/agent";
import { SortableBoard } from "./sortable-board";

/** The cut board: agents ranked by pile, the red cut line above the lowest, and what 100 $CUT saved would pay. */
export function CutBoard({ lineup }: { lineup: Lineup }) {
  const { board, member, cutAt } = lineup;
  // Visitors see the hero first, so their rows are compact on a laptop: the cut line still fits the first screen.
  const compact = member === null;
  const mine = new Map(member?.saves.map((save) => [save.agentId, save.amount]) ?? []);
  const cutLabel = `Cut line · the lowest pile is cut at ${formatUtcTime(cutAt)} UTC`;

  const rows = Object.fromEntries(
    board.entries.map((entry) => [
      entry.agent.id,
      <BoardRow
        key={entry.agent.id}
        entry={entry}
        topPile={board.topPile}
        saved={mine.get(entry.agent.id) ?? null}
        cutLabel={cutLabel}
        compact={compact}
        shortBy={entry.isLowest && board.next && board.gap !== null ? { name: board.next.name, gap: board.gap } : null}
      />,
    ]),
  );

  return (
    <SortableBoard
      rows={rows}
      orders={lineup.orders}
      compact={compact}
      paysLabel="Pays per 100 saved"
      paysNote="if the cut ran now"
      note={
        board.entries.length === 0 ? (
          <p className="rounded-[13px] bg-lime-soft px-3 py-2.5 text-[12px] leading-[17px] lg:mt-2.5 lg:rounded-lg lg:px-3.5 lg:py-3 lg:text-[13.5px] lg:leading-[19px]">
            <b className="font-extrabold">The stage is empty until the first cut, at {formatUtcTime(cutAt)} UTC.</b> Then the biggest bench queues
            take the seats, and their queues become their piles. Save on a bench agent to give it one.
          </p>
        ) : (
        <p className="flex items-start gap-[7px] rounded-[13px] bg-lime-soft px-[9px] pt-1.5 pb-[7px] text-[11px] leading-[14.5px] lg:mt-2.5 lg:items-center lg:gap-2.5 lg:rounded-lg lg:px-3.5 lg:py-2 lg:text-[13.5px] lg:leading-[19px]">
          <ChartPie aria-hidden="true" className="mt-px size-3.5 shrink-0 lg:mt-0 lg:size-[17px]" strokeWidth={2.6} />
          <span>
            <b className="font-extrabold">{SLICE_RULE.bold}</b> {SLICE_RULE.rest}
          </span>
        </p>
        )
      }
    />
  );
}

function BoardRow({
  entry,
  topPile,
  saved,
  cutLabel,
  compact,
  shortBy,
}: {
  entry: BoardEntry;
  topPile: bigint;
  saved: bigint | null;
  cutLabel: string;
  compact: boolean;
  shortBy: { name: string; gap: bigint } | null;
}) {
  const { agent, isLowest, paysPer100 } = entry;
  const phoneSub = shortBy ? `${cut(shortBy.gap)} short of ${shortBy.name}` : `${formatCount(agent.savers)} savers · +${cut(agent.savedToday)} today`;
  const laptopSub = shortBy ? `On the block · ${cut(shortBy.gap)} short` : agent.tagline;

  return (
    <div data-lowest={isLowest || undefined}>
      {isLowest && (
        <div role="separator" aria-label={cutLabel} className={cn("my-px flex h-[17px] items-center gap-1.5 lg:my-0 lg:gap-2.5", compact ? "lg:h-[22px]" : "lg:h-[26px]")}>
          <span className="grow border-t-2 border-dashed border-danger" />
          <Badge variant="cutline" className="px-[7px] text-[9.5px] leading-[13px] tracking-[0.03em] uppercase lg:px-2.5 lg:text-[11px] lg:leading-[18px] lg:tracking-[0.045em]">
            {cutLabel}
          </Badge>
          <span className="grow border-t-2 border-dashed border-danger" />
        </div>
      )}
      <div className={cn("rounded-md", isLowest && "bg-danger-soft lg:-mx-2 lg:px-2")}>
        <div className={cn("relative flex h-[33px] items-center gap-1.5 px-1 lg:gap-3.5 lg:px-0", compact ? "lg:h-[34px]" : "lg:h-11")}>
          <Link
            href={`/agents/${agent.id}`}
            className="flex min-w-0 grow items-center gap-1.5 rounded-sm normal-nums outline-none after:absolute after:inset-0 focus-visible:ring-3 focus-visible:ring-ring/50 lg:w-[204px] lg:shrink-0 lg:grow-0 lg:gap-3"
          >
            <AgentTile id={agent.id} name={agent.name} className={compact ? "lg:size-7" : "lg:size-[34px]"} />
            <span className="min-w-0">
              <span className="flex items-center gap-[5px] lg:gap-1.5">
                <span className={cn("text-[13.5px] leading-4 font-bold whitespace-nowrap lg:text-[14.5px]", compact ? "lg:leading-4" : "lg:leading-[18px]")}>{agent.name}</span>
                {saved !== null && (
                  <Badge variant="lime" size="xs" className="uppercase lg:px-[7px] lg:text-[10px] lg:leading-[15px]">
                    Your {cutFine(saved)}
                  </Badge>
                )}
              </span>
              <span className="block truncate text-[10.5px] leading-[14px] text-ink-3 lg:hidden">{phoneSub}</span>
              <span className={cn("hidden truncate text-xs text-ink-3 lg:block", compact ? "leading-[14px]" : "leading-4")}>{laptopSub}</span>
            </span>
          </Link>

          <span className="w-[54px] shrink-0 text-right lg:flex lg:w-auto lg:min-w-0 lg:grow lg:flex-row-reverse lg:items-center lg:gap-2.5">
            <span className="block font-heading text-sm leading-[17px] font-extrabold whitespace-nowrap lg:w-[72px] lg:shrink-0 lg:text-base">
              <span className="sr-only">Pile </span>
              {cut(agent.pile)}
            </span>
            <span aria-hidden="true" className="mt-[3px] block h-1 overflow-hidden rounded-[2px] bg-line lg:mt-0 lg:h-2.5 lg:grow lg:rounded-[5px] lg:bg-canvas">
              <span
                className={cn("block h-full rounded-[inherit]", isLowest ? "bg-danger" : "bg-ink")}
                style={{ width: `${barPercent(agent.pile, topPile, 4)}%` }}
              />
            </span>
          </span>

          <span className="hidden w-[54px] shrink-0 text-right text-[14.5px] font-bold lg:block">
            <span className="sr-only">Savers </span>
            {formatCount(agent.savers)}
          </span>
          <span className="hidden w-[100px] shrink-0 text-right text-sm font-bold whitespace-nowrap text-gain lg:block">
            <span className="sr-only">Saved today </span>+{cut(agent.savedToday)}
          </span>

          <span className="flex w-9 shrink-0 justify-end lg:w-[132px]">
            {isLowest ? (
              <Badge variant="danger" className="px-1.5 text-[10.5px] leading-[15px] tracking-normal lg:px-2.5 lg:text-[12.5px] lg:leading-[21px]">
                Cut<span className="sr-only"> if the cut ran now: its savers lose their save</span>
              </Badge>
            ) : (
              <span className="font-heading text-sm leading-[17px] font-extrabold whitespace-nowrap text-gain lg:text-lg">
                <span className="sr-only">Pays per 100 saved, if the cut ran now: </span>
                {paysPer100 === null ? "—" : formatAmount(paysPer100, { maxFractionDigits: 2, minFractionDigits: 2 })}
              </span>
            )}
          </span>

          <Button
            asChild
            size="xs"
            variant={isLowest ? "lime" : "outline"}
            className="relative z-10 w-11 px-0 lg:h-8 lg:w-16 lg:text-[13px]"
          >
            <WalletGatedLink href={`/save/${agent.id}`} aria-label={`Save ${agent.name}`}>
              Save
            </WalletGatedLink>
          </Button>
        </div>
        {shortBy && (
          <p className="flex items-start gap-1.5 px-2 pb-[7px] text-[11px] leading-[14.5px] font-semibold normal-nums lg:hidden">
            <ArrowUp aria-hidden="true" className="mt-px size-[13px] shrink-0" strokeWidth={3} />
            <span>{rescueLine(agent.name, shortBy.name, shortBy.gap)}</span>
          </p>
        )}
      </div>
    </div>
  );
}
