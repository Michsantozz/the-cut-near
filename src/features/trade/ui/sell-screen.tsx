"use client";

import { cn } from "cn";
import { Check, Lock, Minus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Quote } from "@/entities/market";
import { CUT_DECIMALS, parseUnits } from "@/shared/lib/amount";
import { formatUsd, formatUtcTime } from "@/shared/ui/format";
import { Button } from "@/shared/ui/button";
import { useNow } from "@/shared/ui/use-now";
import { useWallet } from "@/shared/wallet";

import { minOut, sellCalls, SLIPPAGE_BPS } from "../model/calls";
import { classifyTxError, type TxFailure } from "../model/errors";
import { cutToUsdCents, spotPrice } from "../model/money";
import { cutToInput, defaultSell, sellShare, SELL_PRESETS } from "../model/sell";
import { quoteSellAction } from "../server/actions";
import type { SellData } from "../server/load";
import { cutMoney, cutText, nearMoney, nearText, priceText, prizeName, savedLine } from "./copy";
import { FieldLabel, Row, TradeFrame } from "./frame";
import { FailedStep, PendingStep, TxLink } from "./status";
import { toQuote, useQuote } from "./use-quote";

type Step =
  | { kind: "amount"; note?: string }
  | { kind: "moved"; quote: Quote; was: Quote }
  | { kind: "pending"; cutIn: bigint; quote: Quote }
  | { kind: "success"; cutIn: bigint; quote: Quote; txHash: string }
  | { kind: "failed"; reason: TxFailure };

const SHARE_WORDS: Record<number, string> = { 25: "a quarter of", 50: "half of", 75: "three quarters of", 100: "all of" };

/** Sell free $CUT for NEAR in The Cut's pool (Sell.dc.html / DeskSell.dc.html). Saved $CUT stays locked. */
export function SellScreen({ data }: { data: SellData }) {
  const { status, openConnect, callContract } = useWallet();
  const router = useRouter();
  const now = new Date(useNow(data.renderedAt));
  const rate = data.usdCentsPerNear;
  const account = data.account;
  const free = account?.free ?? 0n;
  const [text, setText] = useState(account ? cutToInput(defaultSell(free)) : "");
  const [step, setStep] = useState<Step>({ kind: "amount" });

  const cutIn = parseUnits(text, CUT_DECIMALS);
  const { quote, fresh } = useQuote(quoteSellAction, cutIn, data.initial);
  const spot = spotPrice(data.pool);
  const prize = prizeName(now, data.cutAt);
  const lockedTill = `${formatUtcTime(data.cutAt)} UTC`;
  const saved = account ? savedLine(account.saves) : null;
  const tooMuch = cutIn !== null && cutIn > free;
  const preset = SELL_PRESETS.find((percent) => cutIn !== null && cutIn > 0n && sellShare(free, percent) === cutIn);

  async function sell(accepted: Quote) {
    if (status !== "signed-in") return openConnect();
    if (!cutIn || tooMuch) return;
    const latest = await quoteSellAction(cutIn.toString()).then(toQuote, () => accepted);
    if (latest.amountOut < minOut(accepted.amountOut)) return setStep({ kind: "moved", quote: latest, was: accepted });
    setStep({ kind: "pending", cutIn, quote: accepted });
    try {
      const { txHash } = await callContract(sellCalls({ cutIn, minOut: minOut(accepted.amountOut) }));
      setStep({ kind: "success", cutIn, quote: accepted, txHash });
      router.refresh();
    } catch (error) {
      const reason = classifyTxError(error);
      setStep(reason === "cancelled" ? { kind: "amount", note: "Cancelled in the wallet. Nothing moved." } : { kind: "failed", reason });
    }
  }

  if (!account) {
    return (
      <TradeFrame title="Sell $CUT" icon={Minus} iconTile="bg-paper text-ink" nav={{ kind: "close" }}>
        <div className="flex grow flex-col items-start gap-4 pt-6 lg:pt-0">
          <p className="text-[15px] leading-[22px] text-ink-2">Connect the wallet that holds your $CUT to sell it. Only free $CUT can be sold; saved $CUT stays locked until the cut.</p>
          <Button variant="lime" size="xl" elevated className="h-14 w-full rounded-2xl text-base lg:w-auto" onClick={openConnect}>
            Connect a wallet
          </Button>
        </div>
      </TradeFrame>
    );
  }

  if (step.kind === "pending") {
    return (
      <TradeFrame title="Selling $CUT" nav={{ kind: "close" }} hideHeader>
        <PendingStep
          title="Swapping $CUT for NEAR"
          from={{ label: "$CUT", sub: cutText(step.cutIn) }}
          to={{ label: "NEAR", sub: nearText(step.quote.amountOut) }}
          note={`The 1% fee, ${cutMoney(step.quote.fee, spot, rate)}, goes to ${prize}`}
        />
      </TradeFrame>
    );
  }

  if (step.kind === "success") {
    const left = free - step.cutIn;
    const savedTotal = account.saves.reduce((sum, save) => sum + save.amount, 0n);
    const yours = left + savedTotal;
    return (
      <TradeFrame title="Sold" nav={{ kind: "close" }} hideHeader>
        <div role="status" className="flex grow flex-col pt-[72px] lg:pt-2">
          <span aria-hidden="true" className="flex size-[72px] items-center justify-center rounded-2xl border-2 border-ink bg-lime shadow-hard">
            <Check className="size-8" strokeWidth={3} />
          </span>
          <p className="mt-6 font-heading text-[44px] leading-[48px] font-extrabold tracking-[-1.5px]">Sold.</p>
          <p className="mt-2 text-[17px] leading-6">
            {nearText(step.quote.amountOut)} NEAR{rate !== null ? ` (${nearMoney(step.quote.amountOut, rate)})` : ""} is in your wallet.
            {saved && account.saves.length === 1 ? ` Your save on ${account.saves[0].robotName} is untouched.` : saved ? " Your saves are untouched." : ""}
          </p>
          <div className="mt-5 rounded-2xl border-2 border-ink bg-paper px-4 py-3">
            <p className="text-[13px] font-bold text-ink-3">Still yours</p>
            <p className="font-heading text-[22px] leading-7 font-extrabold">
              {cutText(yours)} $CUT{rate !== null ? ` · ${formatUsd(cutToUsdCents(yours, spot, rate))}` : ""}
            </p>
            <p className="text-sm leading-5">
              {cutText(left)} free{saved ? ` · ${saved}, locked till ${lockedTill}.` : "."}
            </p>
          </div>
          <p className="mt-3 text-[13px] font-semibold">
            Receipt on NEAR: <TxLink txHash={step.txHash} />
          </p>
          <div className="mt-auto pt-8 lg:mt-6">
            <Button asChild variant="outline" size="xl" elevated className="h-14 w-full rounded-2xl text-base">
              <Link href="/">Back to the lineup</Link>
            </Button>
          </div>
        </div>
      </TradeFrame>
    );
  }

  if (step.kind === "failed") {
    return (
      <TradeFrame title="Sell $CUT" nav={{ kind: "close" }} hideHeader>
        <FailedStep
          title="The sale didn't go through."
          body={
            step.reason === "slippage"
              ? `The $CUT price dropped more than your ${SLIPPAGE_BPS / 100}% limit mid-sale, so nothing was sold. Your $CUT is untouched.`
              : "The contract refused the sale, so nothing was sold. Your $CUT is untouched."
          }
          rows={[
            { label: "Your $CUT", value: `${cutText(free)} free${account.saves.length ? ` + ${cutText(account.saves.reduce((s, x) => s + x.amount, 0n))} saved` : ""}` },
            { label: "Cost of trying", value: rate !== null ? "$0.01 network fee" : "the network fee" },
          ]}
          actions={
            <>
              <Button asChild variant="outline" size="xl" elevated className="h-14 flex-1 rounded-2xl text-[15.5px]">
                <Link href="/">Back to the lineup</Link>
              </Button>
              <Button variant="lime" size="xl" elevated className="h-14 flex-1 rounded-2xl text-[15.5px]" onClick={() => setStep({ kind: "amount" })}>
                Try again
              </Button>
            </>
          }
        />
      </TradeFrame>
    );
  }

  const shown = step.kind === "moved" ? step.quote : quote;
  const sub =
    cutIn !== null && cutIn > 0n
      ? `${preset ? SHARE_WORDS[preset] : "of"} your ${cutText(free)} free${rate !== null ? ` · worth ${formatUsd(cutToUsdCents(cutIn, spot, rate))}` : ""}`
      : `You have ${cutText(free)} free $CUT`;

  return (
    <TradeFrame title="Sell $CUT" icon={Minus} iconTile="bg-paper text-ink" nav={{ kind: "close" }}>
      <div className="flex grow flex-col lg:grid lg:grid-cols-2 lg:gap-[30px]">
        <div className="flex flex-col">
          <FieldLabel htmlFor="sell-amount">You sell</FieldLabel>
          <div className="mt-3.5 flex items-baseline justify-center lg:mt-1.5 lg:h-28 lg:items-center lg:justify-start lg:rounded-[20px] lg:border-2 lg:border-ink lg:bg-paper lg:px-6 lg:ring-4 lg:ring-violet/20">
            <input
              id="sell-amount"
              inputMode="decimal"
              autoComplete="off"
              aria-label="$CUT to sell"
              value={text}
              placeholder="0"
              onChange={(event) => {
                const next = event.target.value.replaceAll(",", "");
                if (next === "" || /^\d{0,12}(\.\d{0,2})?$/.test(next)) setText(next);
              }}
              className={cn(
                "max-w-full min-w-[1ch] bg-transparent text-right font-heading [field-sizing:content] text-[64px] leading-[68px] font-extrabold tracking-[-2px] outline-none lg:text-left",
                tooMuch && "text-burn",
              )}
            />
            <span className="ml-2 font-heading text-[28px] font-extrabold lg:text-[32px]">$CUT</span>
          </div>
          <p className="mt-2 text-center text-[15px] font-semibold text-ink-3 lg:mt-3 lg:text-left">{sub}</p>
          <div role="group" aria-label="How much" className="mt-3.5 flex justify-center gap-2 lg:grid lg:grid-cols-4 lg:gap-2.5">
            {SELL_PRESETS.map((percent) => (
              <button
                key={percent}
                type="button"
                aria-pressed={preset === percent}
                onClick={() => setText(cutToInput(sellShare(free, percent)))}
                className="h-9 rounded-full border-2 border-ink bg-paper px-4 text-[13.5px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-lime lg:h-[44px] lg:rounded-xl lg:text-[15.5px] lg:font-extrabold"
              >
                {percent === 100 ? "All free" : `${percent}%`}
              </button>
            ))}
          </div>
          {saved && <LockNote text={`${cutText(free)} free · ${saved}, locked till ${lockedTill}. Only free $CUT can be sold.`} where="hidden lg:flex" />}
        </div>

        <div className="flex grow flex-col">
          <section aria-label="What you get" className="mt-3.5 rounded-3xl border-2 border-ink bg-paper px-4 pt-3 pb-3 shadow-hard lg:mt-0 lg:px-5 lg:pt-[18px] lg:pb-3">
            <p className="text-[13px] font-bold text-ink-3 lg:text-sm">You get</p>
            <p className={cn("flex items-baseline justify-between gap-3", !fresh && step.kind !== "moved" && "opacity-60")}>
              <span className="font-heading text-[26px] leading-8 font-extrabold lg:text-[38px] lg:leading-[44px]">{shown ? `${nearText(shown.amountOut)} NEAR` : "—"}</span>
              {shown && rate !== null && <span className="text-base font-bold">{nearMoney(shown.amountOut, rate)}</span>}
            </p>
            <dl className="mt-2 lg:mt-2.5 lg:border-t-[1.5px] lg:border-canvas">
              <Row label={`Fee (1%) · to ${prize}`} value={shown ? cutMoney(shown.fee, spot, rate) : "—"} />
              <Row label="Network fee" value={rate !== null ? "about $0.01" : "under 0.01 NEAR"} />
              <Row label="Price per $CUT" value={priceText(spot, rate)} />
              <Row label="Free $CUT left" value={`${cutText(cutIn !== null && !tooMuch ? free - cutIn : free)} $CUT`} />
            </dl>
          </section>
          {saved && <LockNote text={`${cutText(free)} free · ${saved}, locked till ${lockedTill}. Only free $CUT can be sold.`} where="lg:hidden" />}
          {tooMuch && (
            <p role="alert" className="mt-3 rounded-2xl border-2 border-ink bg-danger-soft px-4 py-2.5 text-sm font-semibold">
              You have {cutText(free)} free $CUT. Saved $CUT stays locked until the cut.
            </p>
          )}
          {step.kind === "moved" && (
            <p role="status" className="mt-3 rounded-2xl border-2 border-ink bg-paper px-4 py-2.5 text-sm font-semibold">
              The price moved while you waited. You now get {nearText(step.quote.amountOut)} NEAR instead of {nearText(step.was.amountOut)}.
            </p>
          )}
          {step.kind === "amount" && step.note && (
            <p role="status" className="mt-3 rounded-2xl border-2 border-ink bg-paper px-4 py-2.5 text-sm font-semibold">
              {step.note}
            </p>
          )}
          <div className="mt-auto pt-6 lg:pt-5">
            <Button
              variant="black"
              size="xl"
              disabled={status === "signed-in" && (!shown || (!fresh && step.kind !== "moved") || tooMuch || !cutIn)}
              className="h-14 w-full rounded-2xl text-base shadow-hard-violet"
              onClick={() => shown && void sell(shown)}
            >
              {status === "signed-out" ? "Connect a wallet to sell" : step.kind === "moved" ? "Accept new price" : `Sell ${cutIn ? cutText(cutIn) : ""} $CUT`}
            </Button>
          </div>
        </div>
      </div>
    </TradeFrame>
  );
}

function LockNote({ text, where }: { text: string; where: string }) {
  return (
    <p className={cn("mt-4 flex items-center gap-3 rounded-2xl border-2 border-ink bg-lime px-4 py-3 text-sm leading-5 font-bold lg:mt-[22px] lg:text-[14.5px]", where)}>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-paper">
        <Lock className="size-4" strokeWidth={2.6} />
      </span>
      <span>{text}</span>
    </p>
  );
}
