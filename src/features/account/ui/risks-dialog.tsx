"use client";

import { TriangleAlert } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/shared/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/shared/ui/dialog";

import { risks } from "../model/copy";

/** "The risks, plainly": what can go wrong, in four cards. */
export function RisksDialog({ time, className }: { time: string; className?: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className={cn("bg-danger-soft", className)}>
          <TriangleAlert aria-hidden="true" className="size-4" strokeWidth={2.6} />
          Risks
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100%-2rem)] gap-0 rounded-3xl border-2 border-ink p-5 shadow-hard-lg ring-0 sm:max-w-[756px] lg:p-8">
        <DialogTitle className="flex items-center gap-3 pr-10 font-heading text-[26px] leading-8 font-extrabold tracking-[-1px] lg:text-[32px]">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border-2 border-ink bg-orange lg:size-11">
            <TriangleAlert aria-hidden="true" className="size-5" strokeWidth={2.6} />
          </span>
          The risks, plainly
        </DialogTitle>
        <DialogDescription className="sr-only">Four ways this can go wrong for you.</DialogDescription>
        <ol className="mt-5 grid gap-3 lg:grid-cols-2">
          {risks(time).map((risk, index) => (
            <li key={risk.title} className="flex gap-3 rounded-2xl border-2 border-ink bg-[#f5f7fb] px-4 py-4">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border-2 border-ink text-base font-extrabold", risk.tone, risk.tone === "bg-violet" && "text-paper")}>
                {index + 1}
              </span>
              <span>
                <span className="block text-base font-extrabold">{risk.title}</span>
                <span className="mt-0.5 block text-sm leading-5 text-ink-2">{risk.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <DialogClose asChild>
          <Button variant="black" size="xl" className="mt-5 w-full rounded-2xl lg:ml-auto lg:w-[200px]">
            Got it
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
