import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { SideAccountCard, SideAccountCardSkeleton } from "./account-card";
import { Logo } from "./logo";
import { MAIN_NAV, MORE_NAV, RECEIPTS_HREF } from "./nav";
import { NavLink } from "./nav-link";

/** The laptop side menu: the four main places, the rest of the app, and who is signed in. */
export function SideNav() {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col overflow-y-auto border-r-2 border-ink bg-paper px-[18px] py-[22px] lg:flex"
    >
      <Link href="/" aria-label="The Cut: the lineup" className="w-fit rounded-md pl-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Logo />
      </Link>

      <ul className="mt-[26px] flex flex-col gap-1">
        {MAIN_NAV.map(({ label, href, icon: Icon }) => (
          <li key={href}>
            <NavLink
              href={href}
              className="flex h-[46px] items-center gap-3 rounded-lg border-2 border-transparent px-3 text-[15.5px] font-semibold outline-none hover:bg-canvas focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:border-ink aria-[current=page]:bg-lime aria-[current=page]:font-extrabold"
            >
              <Icon aria-hidden="true" className="size-5" strokeWidth={2.4} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      <hr className="mt-3.5 mb-2.5 border-t-[1.5px] border-line" />

      <ul className="flex flex-col gap-0.5">
        {MORE_NAV.map(({ label, href, icon: Icon }) => (
          <li key={href}>
            <NavLink
              href={href}
              className="flex h-9 items-center gap-2.5 rounded-md px-3 text-sm font-semibold text-ink-2 outline-none hover:bg-canvas focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-canvas aria-[current=page]:font-extrabold aria-[current=page]:text-ink"
            >
              <Icon aria-hidden="true" className="size-[17px] text-ink-3" strokeWidth={2.3} />
              {label}
            </NavLink>
          </li>
        ))}
        <li>
          <NavLink
            href={RECEIPTS_HREF}
            className="flex h-9 items-center justify-between rounded-md px-3 text-sm font-semibold text-ink-2 outline-none hover:bg-canvas focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-canvas aria-[current=page]:font-extrabold"
          >
            Receipts
            <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={2.4} />
          </NavLink>
        </li>
      </ul>

      <div className="mt-auto pt-6">
        <Suspense fallback={<SideAccountCardSkeleton />}>
          <SideAccountCard />
        </Suspense>
      </div>
    </nav>
  );
}
