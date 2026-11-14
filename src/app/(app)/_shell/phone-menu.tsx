"use client";

import { Menu } from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";

import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/shared/ui/sheet";

/** The phone menu: a tab that opens every place of the app, grouped by intent. Following a link closes it. */
export function PhoneMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeOnLink = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  };
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="group flex min-w-16 flex-col items-center gap-[3px] rounded-md text-[11px] font-semibold text-ink-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:font-bold data-[state=open]:text-ink">
        <span className="rounded-full px-[11px] py-[3px] group-data-[state=open]:bg-lime">
          <Menu aria-hidden="true" className="size-[22px]" strokeWidth={2.2} />
        </span>
        Menu
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto border-ink px-4 pt-5 pb-8">
        <SheetTitle className="font-heading text-2xl font-extrabold">Menu</SheetTitle>
        <SheetDescription className="sr-only">Every place of The Cut: play, learn, proof and more.</SheetDescription>
        <div onClick={closeOnLink} className="mt-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
