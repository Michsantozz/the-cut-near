"use client";

import { cn } from "cn";
import { ChevronRight, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/shared/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { Skeleton } from "@/shared/ui/skeleton";

import { useWallet, type WalletOption } from "./wallet-context";

// The design's three wallets come first when the network offers them; the rest stay one tap away in NEAR Connect's picker.
const PREFERRED = ["meteor-wallet", "hot-wallet", "mynearwallet", "intear-wallet"];
const SHOWN = 3;

const LOOK: Record<string, { sub: string; tile: string }> = {
  "meteor-wallet": { sub: "Browser and phone", tile: "bg-ink text-paper" },
  "hot-wallet": { sub: "Inside Telegram", tile: "bg-orange text-ink" },
  mynearwallet: { sub: "Web wallet", tile: "bg-sky text-ink" },
  "intear-wallet": { sub: "Web wallet", tile: "bg-violet text-paper" },
};
const DEFAULT_LOOK = { sub: "NEAR wallet", tile: "bg-lime text-ink" };

const NEW_TO_NEAR_URL = "https://wallet.near.org";

function pickWallets(wallets: WalletOption[]): { shown: WalletOption[]; more: number } {
  const rank = (id: string) => {
    const index = PREFERRED.indexOf(id);
    return index === -1 ? PREFERRED.length : index;
  };
  const sorted = [...wallets].sort((a, b) => rank(a.id) - rank(b.id));
  return { shown: sorted.slice(0, SHOWN), more: Math.max(0, sorted.length - SHOWN) };
}

export function ConnectSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { wallets, connect } = useWallet();
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function choose(walletId?: string) {
    setPending(walletId ?? "picker");
    setFailed(false);
    try {
      await connect(walletId);
      onOpenChange(false);
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  const { shown, more } = wallets ? pickWallets(wallets) : { shown: [], more: 0 };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="auto" className="px-5 pt-5 pb-[26px] lg:px-[26px] lg:pt-[26px] lg:pb-[22px]">
        <div aria-hidden="true" className="mx-auto -mt-2 mb-3.5 h-[5px] w-11 rounded-full bg-line-3 lg:hidden" />
        <SheetHeader>
          <SheetTitle>Connect a NEAR wallet</SheetTitle>
          <SheetDescription>To buy, save agents and collect prizes. Looking around needs none, and connecting never moves money.</SheetDescription>
        </SheetHeader>

        <div className="mt-3.5 flex flex-col gap-2 lg:mt-4" aria-busy={wallets === null}>
          {wallets === null &&
            Array.from({ length: SHOWN }, (_, index) => <Skeleton key={index} className="h-[58px] rounded-xl bg-canvas" />)}
          {wallets?.length === 0 && (
            <p role="status" className="rounded-xl border-2 border-ink bg-canvas px-3.5 py-3 text-[13px] leading-[18px] font-semibold">
              The wallet list did not load. Check your connection and open this again.
            </p>
          )}
          {shown.map((wallet) => {
            const look = LOOK[wallet.id] ?? DEFAULT_LOOK;
            return (
              <WalletRow
                key={wallet.id}
                initial={wallet.name.charAt(0)}
                name={wallet.name}
                sub={pending === wallet.id ? "Opening the wallet…" : look.sub}
                tile={look.tile}
                disabled={pending !== null}
                onClick={() => choose(wallet.id)}
              />
            );
          })}
          {more > 0 && (
            <WalletRow
              initial={<Wallet className="size-[18px]" strokeWidth={2.4} />}
              name="Other wallets"
              sub={pending === "picker" ? "Opening the list…" : `${more} more in NEAR Connect`}
              tile="bg-paper text-ink"
              disabled={pending !== null}
              onClick={() => choose()}
            />
          )}
        </div>

        {failed && (
          <p role="alert" className="mt-2.5 text-[13px] font-semibold text-burn">
            Not connected. Nothing moved. You can try again.
          </p>
        )}

        <Button asChild variant="lime" size="xl" elevated className="mt-3 w-full lg:shadow-none">
          <a href={NEW_TO_NEAR_URL} target="_blank" rel="noreferrer">
            New to NEAR? Get a free wallet
          </a>
        </Button>
        <SheetClose asChild>
          <Button variant="ghost" size="md" className="mt-2 w-full text-sm font-bold">
            Just looking
          </Button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}

function WalletRow({
  initial,
  name,
  sub,
  tile,
  disabled,
  onClick,
}: {
  initial: ReactNode;
  name: string;
  sub: string;
  tile: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-[58px] w-full items-center gap-3 rounded-xl border-2 border-ink bg-paper pr-3.5 pl-2.5 text-left transition-colors outline-none hover:bg-canvas focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 lg:h-[60px] lg:px-3.5"
    >
      <span
        aria-hidden="true"
        className={cn("flex size-[38px] shrink-0 items-center justify-center rounded-md border-2 border-ink font-heading text-base font-extrabold lg:size-9", tile)}
      >
        {initial}
      </span>
      <span className="min-w-0 grow">
        <span className="block text-[15px] font-bold">{name}</span>
        <span className="block text-[12.5px] text-ink-3">{sub}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2.6} />
    </button>
  );
}
