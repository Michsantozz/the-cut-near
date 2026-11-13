import Link from "next/link";

import { loadMemberCard } from "@/features/lineup/server";
import { formatAmount, formatUsd } from "@/shared/ui/format";
import { Skeleton } from "@/shared/ui/skeleton";
import { AccountDot, ConnectButton } from "@/shared/wallet";
import { getViewerAccountId } from "@/shared/wallet/server";

import { ACCOUNT_HREF } from "./nav";

const cutFine = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });

/** Bottom of the laptop side menu: the member's account, or "Just looking" with a way to connect. */
export async function SideAccountCard() {
  const accountId = await getViewerAccountId();
  if (!accountId) {
    return (
      <div className="rounded-[18px] border-2 border-ink bg-canvas p-3.5">
        <p className="text-[15px] font-extrabold">Just looking</p>
        <p className="mt-1 text-[12.5px] leading-[17px] text-balance text-ink-3">Looking needs no wallet. Connecting never moves money.</p>
        <ConnectButton variant="lime" className="mt-2.5 h-[42px] w-full rounded-[13px]">
          Connect a wallet
        </ConnectButton>
      </div>
    );
  }

  const card = await loadMemberCard(accountId);
  const label = [card.balance !== null ? `${cutFine(card.balance)} $CUT` : null, card.savedTotal > 0n ? `${cutFine(card.savedTotal)} saved` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={ACCOUNT_HREF}
      className="block rounded-[18px] border-2 border-ink bg-canvas px-3.5 py-3 outline-none hover:bg-line focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex items-center gap-2 text-[15px] font-extrabold">
        <AccountDot className="size-5" />
        <span className="truncate">{card.accountId}</span>
      </span>
      {card.valueUsdCents !== null && (
        <span className="mt-1.5 block font-heading text-[22px] leading-6 font-extrabold">{formatUsd(card.valueUsdCents)}</span>
      )}
      {label && <span className="mt-0.5 block text-[12.5px] font-semibold text-ink-3">{label}</span>}
    </Link>
  );
}

export function SideAccountCardSkeleton() {
  return (
    <div aria-hidden="true" className="h-[106px] rounded-[18px] border-2 border-ink bg-canvas p-3.5">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-6 w-32" />
      <Skeleton className="mt-2 h-3 w-36 bg-line" />
    </div>
  );
}
