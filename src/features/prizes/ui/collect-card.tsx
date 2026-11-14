"use client";

import { cn } from "cn";
import { Check, Download, Gift, RotateCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { useWallet } from "@/shared/wallet";

import { collectCalls } from "../model/claim";

// The "Ready to collect" card (Earnings.dc.html: claimable, claiming, claimed, failed). Collecting is one
// transaction from the viewer's wallet: `claim()`, plus `unsave` when the viewer lets its save go.

export type CollectProps = {
  amount: string;
  usd: string | null;
  dateLabel: string;
  why: string | null;
  keep: { robotId: string; robotName: string; amount: string; nextDay: string } | null;
  registered: boolean;
  explorerTxBase: string;
};

type State = { kind: "ready" } | { kind: "claiming" } | { kind: "claimed"; txHash: string; kept: boolean } | { kind: "failed"; message: string };

export function CollectCard({ amount, usd, dateLabel, why, keep, registered, explorerTxBase }: CollectProps) {
  const { callContract, status, openConnect } = useWallet();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "ready" });
  const [keepOn, setKeepOn] = useState(true);

  async function collect() {
    if (status !== "signed-in") return openConnect();
    setState({ kind: "claiming" });
    try {
      const { txHash } = await callContract(collectCalls({ registered, unsaveRobotId: keep && !keepOn ? keep.robotId : null }));
      setState({ kind: "claimed", txHash, kept: keepOn });
      router.refresh();
    } catch (error) {
      setState({ kind: "failed", message: error instanceof Error ? error.message : "The wallet did not send it." });
    }
  }

  if (state.kind === "claimed") {
    return (
      <section aria-live="polite" className="flex gap-3.5 rounded-3xl border-2 border-ink bg-paper px-[18px] py-4 shadow-hard lg:items-center lg:px-6 lg:py-6">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-lime lg:size-[52px]">
          <Check className="size-5 lg:size-6" strokeWidth={3} />
        </span>
        <div>
          <p className="font-heading text-xl leading-6 font-extrabold lg:text-[28px] lg:leading-8">{amount} $CUT in your wallet</p>
          <p className="mt-0.5 text-sm leading-5 lg:text-base">
            {usd ? `${usd}. ` : ""}
            {keep ? (state.kept ? `Your ${keep.amount} on ${keep.robotName} rides into the next cut.` : `Your ${keep.amount} on ${keep.robotName} is back in your wallet too.`) : "Collected."}
          </p>
          <a href={`${explorerTxBase}${encodeURIComponent(state.txHash)}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[13px] font-bold text-blue underline">
            View the receipt on NEAR
          </a>
        </div>
      </section>
    );
  }

  const failed = state.kind === "failed";
  return (
    <section
      aria-labelledby="collect-title"
      className={cn("rounded-3xl border-2 border-ink px-[18px] pt-3.5 pb-4 shadow-hard-lg lg:px-6 lg:pt-5 lg:pb-5", failed ? "bg-orange" : "bg-lime")}
    >
      <p className="flex items-center gap-1.5 text-[12.5px] font-extrabold tracking-[0.06em] uppercase">
        {failed ? <TriangleAlert aria-hidden="true" className="size-4" strokeWidth={2.6} /> : <Gift aria-hidden="true" className="size-4" strokeWidth={2.6} />}
        {failed ? "Collect didn’t go through" : `Ready to collect · ${dateLabel}`}
      </p>
      <div className="lg:flex lg:items-center lg:gap-7">
        <div className="flex items-baseline justify-between gap-3 lg:shrink-0 lg:justify-start">
          <h2 id="collect-title" className="font-heading text-[40px] leading-[44px] font-extrabold tracking-[-1.2px] whitespace-nowrap lg:text-[52px] lg:leading-[58px]">
            {amount} $CUT
          </h2>
          {usd && <span className="font-heading text-xl font-extrabold lg:text-[22px]">{usd}</span>}
        </div>
        <p className="mt-1 text-[13.5px] leading-[19px] font-bold lg:mt-0 lg:text-[15px]">
          {failed ? `${state.message} Your ${amount} $CUT is still here.` : why}
        </p>
      </div>
      <div className="mt-3 flex flex-col gap-3 lg:mt-4 lg:flex-row lg:items-stretch lg:gap-4">
        {keep && (
          <label className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-paper px-3.5 py-2.5 lg:flex-1">
            <span className="min-w-0 grow">
              <span className="block text-[15px] leading-5 font-extrabold">
                Keep my {keep.amount} on {keep.robotName} for the next cut
              </span>
              <span className="block text-[12.5px] text-ink-3">Rides into {keep.nextDay}. Off: it unlocks.</span>
            </span>
            <Switch
              checked={keepOn}
              onCheckedChange={setKeepOn}
              disabled={state.kind === "claiming"}
              aria-label={`Keep my ${keep.amount} on ${keep.robotName} for the next cut`}
              className="h-7! w-[46px]! border-2! border-ink! px-0.5 data-checked:bg-lime data-unchecked:bg-line [&>span]:size-5! [&>span]:bg-ink! [&>span]:data-checked:translate-x-[18px]!"
            />
          </label>
        )}
        <Button
          type="button"
          variant="black"
          onClick={() => void collect()}
          disabled={state.kind === "claiming"}
          aria-busy={state.kind === "claiming"}
          className="h-[52px] rounded-2xl text-base lg:h-auto lg:min-h-[58px] lg:w-[260px]"
        >
          {state.kind === "claiming" ? (
            <>
              <RotateCw aria-hidden="true" className="size-[18px] animate-spin" strokeWidth={2.6} />
              Confirm in your wallet…
            </>
          ) : failed ? (
            <>
              <RotateCw aria-hidden="true" className="size-[18px]" strokeWidth={2.6} />
              Try again
            </>
          ) : (
            <>
              <Download aria-hidden="true" className="size-[18px]" strokeWidth={2.6} />
              Collect {amount} $CUT
            </>
          )}
        </Button>
      </div>
      {!registered && !failed && <p className="mt-2 text-[12.5px] font-semibold">First collect: your wallet adds 0.01 NEAR so this account can hold $CUT.</p>}
    </section>
  );
}
