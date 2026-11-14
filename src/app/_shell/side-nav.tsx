import Link from "next/link";
import { Suspense } from "react";

import { SideAccountCard, SideAccountCardSkeleton } from "./account-card";
import { Logo } from "./logo";
import { NavGroups } from "./nav-groups";

/** The laptop side menu: the app's places grouped by intent (Play, Learn, Proof, More), and who is signed in. */
export function SideNav() {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col overflow-y-auto border-r-2 border-ink bg-paper px-[18px] py-[22px] lg:flex"
    >
      <Link href="/" aria-label="The Cut: the lineup" className="w-fit rounded-md pl-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Logo />
      </Link>

      <NavGroups foldMore className="mt-6" />

      <div className="mt-auto pt-6">
        <Suspense fallback={<SideAccountCardSkeleton />}>
          <SideAccountCard />
        </Suspense>
      </div>
    </nav>
  );
}
