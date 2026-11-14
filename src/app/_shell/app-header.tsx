import { Bell, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { getNextCut } from "@/entities/cut/server";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { AccountChip, ConnectButton, WalletGatedLink } from "@/shared/wallet";
import { getViewerAccountId } from "@/shared/wallet/server";

import { Logo } from "./logo";
import { ACCOUNT_HREF } from "./nav";
import { NextCutChip } from "./next-cut-chip";
import { requestTime } from "./request-time";

/**
 * Every page's header. Phone: the logo and the wallet. Laptop: the page title, the next-cut chip and the trade buttons.
 * The title stays readable by screen readers on the phone, where the page shows it in its own layout.
 */
export function AppHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="lg:sticky lg:top-0 lg:z-30 lg:bg-canvas">
      <div className="flex items-center justify-between px-5 pt-4 lg:hidden">
        <Link href="/" aria-label="The Cut: the lineup" className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Logo />
        </Link>
        <Suspense fallback={<Skeleton className="h-9 w-24 rounded-full bg-paper" />}>
          <PhoneWallet />
        </Suspense>
      </div>
      <div className="lg:flex lg:h-[76px] lg:items-center lg:gap-3.5 lg:px-8">
        <div className="sr-only lg:not-sr-only lg:min-w-0">
          <h1 className="font-heading text-[30px] leading-[34px] font-extrabold tracking-[-0.8px] whitespace-nowrap">{title}</h1>
          {sub && <p className="truncate text-[13.5px] font-semibold text-ink-3">{sub}</p>}
        </div>
        <div className="hidden lg:ml-auto lg:flex lg:items-center lg:gap-2.5">
          <Suspense fallback={<Skeleton className="h-[42px] w-[420px] rounded-full bg-paper" />}>
            <HeaderActions />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

async function PhoneWallet() {
  const accountId = await getViewerAccountId();
  return accountId ? <AccountChip accountId={accountId} href={ACCOUNT_HREF} /> : <ConnectButton size="md" shape="pill" />;
}

async function HeaderActions() {
  const renderedAt = await requestTime();
  const [accountId, nextCut] = await Promise.all([getViewerAccountId(), getNextCut()]);
  return (
    <>
      <NextCutChip cutAt={nextCut.at.getTime()} renderedAt={renderedAt} />
      {accountId && (
        <Button asChild variant="outline" size="icon">
          <Link href="/notifications" aria-label="Notifications">
            <Bell aria-hidden="true" className="size-[19px]" strokeWidth={2.4} />
          </Link>
        </Button>
      )}
      <Button asChild variant="primary" size="lg" elevated>
        <WalletGatedLink href="/buy">
          <Plus aria-hidden="true" className="size-[17px]" strokeWidth={3} />
          Buy $CUT
        </WalletGatedLink>
      </Button>
      {accountId && (
        <Button asChild variant="outline" size="lg" className="px-4">
          <WalletGatedLink href="/sell">Sell</WalletGatedLink>
        </Button>
      )}
    </>
  );
}
