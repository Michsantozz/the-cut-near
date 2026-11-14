import { Menu } from "lucide-react";
import Link from "next/link";

import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/shared/ui/sheet";

// The landing's own dark top bar: it sits outside the app shell, so it has no side menu or tab bar.

export const LANDING_NAV = [
  { label: "How it works", href: "#how-it-works" },
  { label: "The stage", href: "#the-stage" },
  { label: "House rules", href: "#house-rules" },
  { label: "Receipts", href: "#receipts" },
] as const;

function LogoMark() {
  return (
    <Link href="/" aria-label="The Cut: open the app" className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:gap-2.5">
      <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-[10px] border-2 border-paper bg-blue lg:size-10 lg:rounded-xl">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="size-[18px] text-paper lg:size-[22px]">
          <path d="M18 7.5A7 7 0 1 0 18 16.5" />
        </svg>
      </span>
      <span className="font-heading text-[21px] font-extrabold text-paper lg:text-[26px] lg:tracking-[-0.5px]">the cut</span>
    </Link>
  );
}

const PILL = "flex items-center rounded-full font-extrabold text-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** `note` is the data line on the right: "Sample data · 1 NEAR = $2.50". */
export function TopBar({ note }: { note: string }) {
  return (
    <header className="flex h-[60px] items-center gap-2 bg-ink px-4 whitespace-nowrap lg:h-[72px] lg:gap-10 lg:border-b-2 lg:border-[#23252b] lg:px-[72px]">
      <LogoMark />
      <nav aria-label="Landing" className="hidden gap-7 text-[15px] font-semibold text-paper lg:flex">
        {LANDING_NAV.map((item) => (
          <a key={item.href} href={item.href} className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
            {item.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2 lg:gap-3">
        <span className="hidden text-[13px] font-semibold text-[#9aa0ae] xl:inline">{note}</span>
        <Link href="/test" className={`${PILL} hidden h-[42px] border-2 border-pink bg-pink px-5 text-[15px] lg:flex`}>
          Judges · test account
        </Link>
        <Link href="/" className={`${PILL} h-9 bg-lime px-3.5 text-sm lg:h-[42px] lg:border-2 lg:border-lime lg:px-5 lg:text-[15px]`}>
          Open the app
        </Link>
        <Sheet>
          <SheetTrigger
            aria-label="Menu"
            className="flex size-9 items-center justify-center rounded-[10px] border-2 border-paper text-paper outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
          >
            <Menu aria-hidden="true" className="size-[18px]" strokeWidth={2.8} />
          </SheetTrigger>
          <SheetContent side="right" className="gap-1 p-5 pt-6">
            <SheetTitle className="font-heading text-2xl font-extrabold">The Cut</SheetTitle>
            <p className="text-[13px] font-semibold text-ink-3">{note}</p>
            <nav aria-label="Landing" className="mt-3 flex flex-col">
              {LANDING_NAV.map((item) => (
                <SheetClose asChild key={item.href}>
                  <a href={item.href} className="border-t-[1.5px] border-line py-3 text-base font-extrabold first:border-t-0">
                    {item.label}
                  </a>
                </SheetClose>
              ))}
            </nav>
            <Link href="/test" className={`${PILL} mt-3 h-12 justify-center border-2 border-ink bg-pink text-[15px]`}>
              Judges · test account
            </Link>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
