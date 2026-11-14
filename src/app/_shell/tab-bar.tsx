import { Plus } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { WalletGatedLink } from "@/shared/wallet";

import { MAIN_NAV, type NavItem } from "./nav";
import { NavLink } from "./nav-link";

/** The phone tab bar: Today, Season, the Buy button, Prizes, Director. Hidden while a full-screen flow (`data-fullscreen-flow`) is open. */
export function TabBar() {
  const [lineup, club, prizes, director] = MAIN_NAV;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[82px] items-center justify-around border-t-2 border-ink bg-paper px-2 pb-2 lg:hidden [body:has([data-fullscreen-flow])_&]:hidden"
    >
      <Tab item={lineup} />
      <Tab item={club} />
      <Button asChild variant="primary" elevated className="-mt-[30px] size-14 rounded-full p-0">
        <WalletGatedLink href="/buy" aria-label="Buy $CUT">
          <Plus aria-hidden="true" className="size-[26px]" strokeWidth={3} />
        </WalletGatedLink>
      </Button>
      <Tab item={prizes} />
      <Tab item={director} />
    </nav>
  );
}

function Tab({ item: { label, href, icon: Icon } }: { item: NavItem }) {
  return (
    <NavLink
      href={href}
      className="group flex min-w-16 flex-col items-center gap-[3px] rounded-md text-[11px] font-semibold text-ink-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:font-bold aria-[current=page]:text-ink"
    >
      <span className="rounded-full px-[11px] py-[3px] group-aria-[current=page]:bg-lime">
        <Icon aria-hidden="true" className="size-[22px]" strokeWidth={2.2} />
      </span>
      {label}
    </NavLink>
  );
}
