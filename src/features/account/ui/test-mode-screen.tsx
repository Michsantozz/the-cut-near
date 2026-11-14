import { cn } from "cn";
import { Check, FlaskConical } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/ui/button";
import { CopyButton } from "@/shared/ui/copy-button";
import { ConnectButton, type NearNetwork } from "@/shared/wallet";

import { TOUR, cutEvery } from "../model/copy";

type Props = { accountId: string | null; network: NearNetwork; cutIntervalMs: number };

/**
 * Test mode: the testnet account and the 5-minute tour (buy, save, run the cut, read the receipts).
 * The app never creates keys or signs for the user: step 1 is connecting a testnet wallet.
 */
export function TestModeScreen({ accountId, network, cutIntervalMs }: Props) {
  if (network !== "testnet") return <MainnetNotice />;
  const done = accountId ? 1 : 0;
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-4 px-5 pt-3 pb-6 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start lg:gap-6 lg:px-8 lg:pt-1 lg:pb-8">
      <div className="flex flex-col gap-4">
        <section aria-label="Your test account" className="rounded-3xl border-2 border-ink bg-lime px-[18px] py-4 shadow-hard lg:px-6 lg:py-5">
          {accountId ? (
            <>
              <p className="text-xs font-extrabold tracking-[0.06em] uppercase">You’re in · test account</p>
              <h2 className="mt-1 truncate font-heading text-[26px] leading-8 font-extrabold tracking-[-0.8px] lg:text-[30px]">{accountId}</h2>
              <CopyButton text={accountId} icon label="Copy account name" variant="outline" size="sm" className="mt-3 h-[34px] rounded-[10px] px-3.5 text-[13px]" />
            </>
          ) : (
            <>
              <p className="text-xs font-extrabold tracking-[0.06em] uppercase">Step 1 · test account</p>
              <h2 className="mt-1 font-heading text-[26px] leading-8 font-extrabold tracking-[-0.8px] lg:text-[30px]">Connect a testnet wallet</h2>
              <p className="mt-1 text-sm font-semibold">Any NEAR wallet on testnet works. Test NEAR is free and worth nothing.</p>
            </>
          )}
        </section>
        <p className="text-[13px] font-semibold text-ink-2">On testnet a cut runs {cutEvery(cutIntervalMs)}.</p>
        <div className="flex flex-col gap-2.5">
          {accountId ? (
            <Button asChild variant="primary" size="xl" className="h-14 w-full rounded-2xl text-[17px]">
              <Link href="/buy">Step 2: buy $10 of $CUT</Link>
            </Button>
          ) : (
            <ConnectButton size="xl" className="h-14 w-full rounded-2xl text-[17px]">
              Step 1: connect a test wallet
            </ConnectButton>
          )}
          <Button asChild variant="outline" size="xl" className="h-[50px] w-full rounded-2xl">
            <Link href="/">Look around first</Link>
          </Button>
        </div>
      </div>
      <section aria-labelledby="tour-title">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 id="tour-title" className="font-heading text-xl font-extrabold">
            The 5-minute tour
          </h2>
          <span className="text-[13px] font-bold text-ink-3 tabular-nums">
            {done} of {TOUR.length} done
          </span>
        </div>
        <ol className="rounded-3xl border-2 border-ink bg-paper px-4 shadow-hard">
          {TOUR.map((step, index) => {
            const isDone = index < done;
            return (
              <li key={step.title} className="border-t-[1.5px] border-canvas first:border-t-0">
                <Link href={step.href} className="flex items-center gap-3.5 py-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-ink text-sm font-extrabold tabular-nums",
                      isDone ? "bg-lime" : "bg-paper",
                    )}
                  >
                    {isDone ? <Check aria-label="Done" className="size-3.5" strokeWidth={3} /> : index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block text-base font-extrabold", isDone && "line-through")}>{step.title}</span>
                    <span className="block text-[13px] text-ink-2">
                      You see: {index === 0 && accountId ? accountId : step.see}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function MainnetNotice() {
  return (
    <div className="mx-auto w-full max-w-[640px] px-5 pt-3 pb-6 lg:px-8">
      <section className="flex flex-col items-start gap-3 rounded-3xl border-2 border-ink bg-paper px-5 py-5 shadow-hard">
        <span className="flex size-10 items-center justify-center rounded-xl border-2 border-ink bg-[#ffd84d]">
          <FlaskConical aria-hidden="true" className="size-5" strokeWidth={2.6} />
        </span>
        <h2 className="font-heading text-2xl font-extrabold">Test mode lives on testnet</h2>
        <p className="text-sm text-ink-2">This app runs on mainnet: everything here is real money. Open the testnet app to try the tour for free.</p>
        <Button asChild variant="outline" size="lg" className="rounded-2xl">
          <Link href="/">Back to the lineup</Link>
        </Button>
      </section>
    </div>
  );
}
