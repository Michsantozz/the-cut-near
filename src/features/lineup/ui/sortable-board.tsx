"use client";

import { cn } from "cn";
import { useState, type ReactNode } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";

import { SORT_KEYS, type SortKey } from "../model/board";

const SORT_LABEL: Record<SortKey, { chip: string; ranked: string }> = {
  pile: { chip: "Pile", ranked: "Ranked by pile" },
  savers: { chip: "Savers", ranked: "Ranked by savers" },
  today: { chip: "Today", ranked: "Ranked by saved today" },
  pays: { chip: "Pays most", ranked: "Ranked by pays per 100" },
};

const isSortKey = (value: string): value is SortKey => (SORT_KEYS as readonly string[]).includes(value);

/**
 * The cut board's frame and its sort chips. Rows are rendered on the server; this only switches between
 * orders the server computed. The agent the cut takes stays last, under the cut line, in every order.
 */
export function SortableBoard({
  rows,
  orders,
  note,
  compact,
  paysLabel,
  paysNote,
}: {
  rows: Record<string, ReactNode>;
  orders: Record<SortKey, string[]>;
  note: ReactNode;
  compact: boolean;
  paysLabel: string;
  paysNote: string;
}) {
  const [sort, setSort] = useState<SortKey>("pile");
  const ranked = SORT_LABEL[sort].ranked;

  return (
    <section
      aria-labelledby="lineup-title"
      className="lg:rounded-3xl lg:border-2 lg:border-ink lg:bg-paper lg:px-[18px] lg:pt-3 lg:pb-2 lg:shadow-hard"
    >
      <div className="mt-0.5 flex h-7 items-center justify-between gap-1.5 lg:mt-0 lg:h-8 lg:justify-start lg:gap-3">
        <h2 id="lineup-title" className="font-heading text-[17px] font-extrabold whitespace-nowrap lg:text-2xl">
          The lineup
        </h2>
        <span aria-live="polite" className="hidden text-[13.5px] font-semibold whitespace-nowrap text-ink-3 lg:inline">
          {ranked}
        </span>
        <ToggleGroup
          type="single"
          variant="chip"
          size="sm"
          value={sort}
          onValueChange={(value) => isSortKey(value) && setSort(value)}
          aria-label="Sort the lineup by"
          className="gap-[5px] lg:ml-auto lg:gap-1.5"
        >
          {SORT_KEYS.map((key) => (
            <ToggleGroupItem key={key} value={key} className="lg:h-8 lg:px-3 lg:text-xs lg:font-extrabold">
              {SORT_LABEL[key].chip}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="mt-2 rounded-2xl border-2 border-ink bg-paper px-1.5 pt-1.5 pb-1 shadow-hard lg:mt-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
        {note}

        {/* Column heads; every cell also carries its own screen-reader label. */}
        <div
          aria-hidden="true"
          className={cn(
            "mt-[3px] flex h-[25px] items-end gap-1.5 px-1 text-[9px] leading-[11px] font-extrabold tracking-[0.03em] whitespace-nowrap text-ink-3 uppercase lg:mt-1 lg:gap-3.5 lg:border-b-2 lg:border-ink lg:px-0 lg:pb-1.5 lg:text-[11px] lg:leading-[14px] lg:tracking-[0.055em]",
            compact ? "lg:h-[34px]" : "lg:h-[38px]",
          )}
        >
          <span className="min-w-0 grow pb-px lg:hidden">{ranked}</span>
          <span className="w-[54px] shrink-0 pb-px lg:hidden">Pile</span>
          <span className="hidden w-[204px] shrink-0 lg:block">Agent</span>
          <span className="hidden min-w-0 grow lg:block">Pile · $CUT saved</span>
          <span className="hidden w-[54px] shrink-0 text-right lg:block">Savers</span>
          <span className="hidden w-[100px] shrink-0 text-right lg:block">Today</span>
          <span className="flex w-[86px] shrink-0 flex-col items-end lg:w-[132px]">
            <span>{paysLabel}</span>
            <span className="text-[9.5px] font-semibold tracking-normal normal-case lg:text-[11.5px]">{paysNote}</span>
          </span>
          <span className="hidden w-16 shrink-0 lg:block" />
        </div>

        <ol aria-label={`The lineup, ${ranked.toLowerCase()}`} className="flex flex-col">
          {orders[sort].map((id) => (
            <li key={id} className="lg:border-t-[1.5px] lg:border-canvas lg:first:border-t-0 lg:[&:has([data-lowest])]:border-t-0">
              {rows[id]}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
